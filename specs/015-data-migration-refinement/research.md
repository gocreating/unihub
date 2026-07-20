# Research — Data Migration Refinement (015)

**Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

## R1. P1 bug — push preview reports 1000+ inventory.item deletions

**Observed**: The publish preview reported 1000+ `inventory.item` deletions; the surviving
rows correlate with the catalog default filter (`obtained_at ≥ Jan 1 of current year OR
is_empty`), so issue #35 hypothesizes the filter leaks into sync.

**Code inspection findings** (no filter path found):

- `csv_exporter.export_table()` reads `descriptor.model_class.objects.all()` — unfiltered;
  `Item` has no custom manager (`inventory/models.py` defines only `Meta.ordering`).
- `publish_helper.preview_publish_against_head()` diffs the full local export against the
  server clone's `HEAD:...csv` via pure dict math (`_diff_row_sets`). `parse_csv` either
  returns all rows or (on any validation error) an empty list **plus errors**, in which
  case the whole table is skipped — it can never silently drop a subset of rows.
- Neither `EntityFilterBackend` nor any view-layer filter participates in the sync path.

**Root-cause hypotheses** (to be confirmed by reproduction, ranked):

- **H1 — stale/orphaned server clone base (leading)**: `publish_preview()` calls
  `ensure_clone()` but never fetches or resets; it diffs the DB against whatever `HEAD`
  the long-lived `SYNC_REPO_DIR` clone happens to have. That HEAD can be arbitrarily old,
  or orphaned entirely after the data repo was force-pushed (force-push awareness is
  explicitly part of issue #35). Any rows present in that stale snapshot but absent from
  the current DB (e.g. rows carrying pre-`legacy_ref`-upsert NanoID PKs from before the
  iteration-25 stable-PK re-imports) surface as mass "deletions".
- **H2 — PK drift across devices/imports**: the same logical rows exist under different
  NanoID PKs in the compared snapshots (the risk `import_from_clone`'s truncate-reinsert
  docstring already names), producing paired delete+create noise.
- **H3 — an actual filter injection**: not found in code; the regression test locks it out
  permanently either way.

**Decision — fix architecture (independent of which hypothesis reproduces)**:

1. **The server clone is a disposable cache; the DB is the source of truth.** Every
   preview/publish/history operation first fetches and hard-resets the clone to the
   remote head (empty-remote and unreachable-remote handled as in `status()`). Previews
   are therefore always computed against the *actual* remote state, never a stale HEAD.
2. **Preview→confirm pinning**: preview responses carry `base_commit` (the remote head
   sha the diff was computed against) plus a `diff_digest` (sha256 over the canonical
   diff JSON). Confirm requests echo both; the server recomputes the diff against
   `base_commit` and rejects with `409 preview_stale` when the digest no longer matches
   (remote moved, or local DB changed mid-flow). This is the mechanism behind spec
   FR-002 "confirm performs exactly the previewed changes".
3. **Reproduction-first (TDD)**: a failing pytest is written before the fix using the
   existing `bare_repo` fixture (`tests/sync/conftest.py` — local `git init --bare` +
   `file://` URL, dummy PAT): multi-year inventory dataset → publish → preview must be
   `up_to_date`; then mutate the clone HEAD to an older/foreign commit and assert the
   preview STILL diffs against the remote head (H1 regression); plus the spec FR-004
   scenario (multi-year dataset, catalog default filter present) asserting zero
   deletions.

**Alternatives considered**: fetching without reset (keeps local-only commits — but the
clone must never own commits the remote lacks; publish pushes immediately, so local-only
commits only exist after failures and are exactly the corrupt state to discard);
pinning by echoing full row lists instead of a digest (heavier payloads, same guarantee).

## R2. Preview-table pagination footer (constitution compliance)

**Decision**: Replace the antd built-in `pagination` prop in `ChangePreviewTable`
(`components/ImportExport/ChangePreviewTable.tsx` — currently
`pagination={{ pageSize: 10, hideOnSinglePage: true }}`, which renders the size changer
*after* the page numbers) with a controlled client-side footer that reproduces the
constitution's footer contract: left = "N records" (ICU plural), right = per-page size
`Select` **then** `Pagination`, flush right. Implemented once as a small shared
`ClientPaginationFooter` next to the existing server-side footers so every preview tab
(creates/updates/deletes, push/pull/checkout) inherits it; an RTL test locks the DOM
order (info → size selector → pagination). `EntityOffsetFooter` itself is coupled to
server-side offset state, so a client-side sibling following the same layout is the
minimal compliant reuse.

**Alternatives**: antd `showSizeChanger` (renders on the wrong side — rejected);
migrating ChangePreviewTable to PageTable (explicitly rejected in-file: diff preview
tables intentionally avoid PageTable's sticky machinery inside collapse panels).

## R3. Commit graph — data source and rendering

**Decision (backend)**: New `GET /api/v1/sync/history/` — after fetch+reset (R1), read
`git log FETCH_HEAD --format=%H%x1f%P%x1f%aI%x1f%s` (paged: `limit` default 50,
`before` sha cursor for load-more) and return commit nodes annotated with:
`is_remote_head`, `is_local_state` (see R4), `compatible` + `incompatible_reason`
(see R6), plus top-level `history_rewritten` (R4), `local_commit`, `remote_head`, and
`has_local_changes` (cheap dirty check: export-diff non-empty) so the UI can render the
pending-local-changes pseudo-node.

**Decision (frontend)**: a custom lightweight React component (vertical rail of commit
nodes: dot + sha7 + relative time + message, badges for "local", "remote latest",
disabled styling + gated tooltip for incompatible nodes, divergence banner). No new
dependency: the history is linear-with-at-most-one-divergence, not a general DAG;
ECharts stays scoped to finance visualizations per the constitution's chart principle,
and an interactive control surface (clickable/disabled nodes, kebab actions) is a
component, not a chart.

**Alternatives**: ECharts graph series (wrong tool for interactive controls; new
constitution surface), antd `Timeline` (no disabled/interactive node affordances —
used as a styling reference only), gitgraph-js (new dependency for a linear list).

## R4. Local-state marker and force-push detection

**Decision**: `SyncConfig` gains `local_state_commit` (sha the local DB last
corresponded to — written by publish, force-publish, and checkout/apply confirm) and
`last_known_remote_commit` (sha of the remote head recorded at every successful fetch).
On each history/status fetch: if the stored `last_known_remote_commit` is neither equal
to nor an ancestor of the new remote head (`git merge-base --is-ancestor`), the remote
history was rewritten → `history_rewritten: true`, surfaced as a persistent warning
banner on the graph (spec FR-008). `last_published_commit` / `last_applied_at` remain
for display; `last_applied_commit` already exists and keeps its meaning.

**Alternatives**: comparing full sha lists per fetch (requires persisting history);
relying on `git rev-list HEAD...FETCH_HEAD` divergence alone (clone HEAD is reset per
R1, so it no longer encodes what the app previously knew).

## R5. Row-level staging

**Decision (model)**: staging is transient request state, not a persisted entity.
Preview rows already carry `pk` + `operation`; the frontend tracks exclusions and the
confirm request sends `{base_commit, diff_digest, excluded: [{table, pk}]}` (empty
`excluded` = everything staged — the default). The digest check (R1) guarantees the
staged subset is applied against exactly the previewed diff.

**Decision (partial publish algorithm)**: start from the base commit's CSV rows, apply
only the staged create/update/delete operations on top, write the hybrid CSVs, commit,
push. Unstaged local differences remain uncommitted and reappear in the next preview
(spec FR-012) — no separate "pending" store needed.

**Decision (partial apply/checkout algorithm)**: today's `import_from_clone` is
truncate-then-reinsert and cannot apply subsets. A new selective apply path executes
only the staged ChangeRecords via the existing `apply_diff` row operations, ordered by
the registry's `topo_sort` (creates/updates parents-first, deletes children-first),
with `_upsert_attribute_values` handling attribute columns. Full-selection checkout of
the remote head therefore replaces the legacy apply-confirm exactly.

**Decision (dependency closure, FR-014)**: computed server-side at confirm from
registry FK metadata (`fk_content_type_label`), fully domain-generic: a staged
create/update referencing a PK that exists neither in the DB nor among staged creates
auto-includes the missing create (transitively); a staged delete whose dependent child
rows are being deleted in the same diff auto-includes those child deletes. The confirm
response reports `auto_included: [{table, pk, operation}]` so the UI can inform the
user (spec US4-5).

**Decision (UI)**: antd Table `rowSelection` checkboxes on every preview tab,
`Collapse`-header checkbox for table scope, master checkbox for all changes, ICU-plural
selected/total counts; confirm disabled at zero staged rows with an explanatory hint.

**Alternatives**: persisting staging server-side (stateful, survives nothing useful —
previews are cheap); sending the staged inclusion list (payload grows with the common
case; equivalent semantics).

## R6. Checkout + compatibility assessment

**Decision**: `GET /api/v1/sync/checkout/preview/?commit=<sha>` diffs that commit's
CSVs (via `git show <sha>:<file>`) against the current DB in replace mode — reusing the
`preview_from_fetch_head` machinery generalized to any sha — and
`POST /api/v1/sync/checkout/confirm/` applies the staged subset (R5). The legacy
`apply/preview` + `apply/confirm` endpoints are **removed**; "Apply Latest" ≡ checkout
of the remote head. Checkout never touches the remote; it updates `local_state_commit`
and `last_applied_at`. Publishing afterwards produces a new forward commit on the
remote head (never a rewrite — force-publish stays the only, explicit, override; spec
FR-019/FR-020).

**Compatibility (FR-017/FR-018)**: a commit is compatible iff, for every registered
table file present in it, the CSV **header row** passes the existing `parse_csv` header
validation (required system columns present by bare name; unknown columns and missing
optional columns are tolerated exactly as the importer tolerates them), and no
registered-table file that the current app requires is structurally unreadable. Header
lines are read via `git show <sha>:<file>` (first line only) — cheap enough to compute
per history page without caching infrastructure. Incompatible nodes return a
human-readable `incompatible_reason` (missing columns list / unreadable file).

**Alternatives**: full-file parse per commit (O(history × rows) — wasteful);
version-stamping snapshots with a schema manifest (better long-term, but cannot
classify the existing unstamped history — recorded as future work, not needed to meet
the spec).

## R7. API surface (summary — full contracts in [contracts/sync-api.md](contracts/sync-api.md))

| Endpoint | Change |
|---|---|
| `GET /api/v1/sync/history/` | NEW — commit graph payload (R3/R4/R6) |
| `GET /api/v1/sync/publish/preview/` | + `base_commit`, `diff_digest` |
| `POST /api/v1/sync/publish/` | body `{base_commit, diff_digest, excluded[]}`; 409 `preview_stale` |
| `POST /api/v1/sync/force-publish/` | same body/pinning as publish |
| `GET /api/v1/sync/checkout/preview/` | NEW — `?commit=<sha>` |
| `POST /api/v1/sync/checkout/confirm/` | NEW — `{commit, diff_digest, excluded[]}` → `auto_included[]` |
| `GET /api/v1/sync/apply/preview/`, `POST /api/v1/sync/apply/confirm/` | REMOVED (superseded by checkout of remote head) |
| `GET /api/v1/sync/config/` | + `local_state_commit` |

All serializers annotated for drf-spectacular; `openapi.yaml` regenerated and frontend
types re-generated via `openapi-typescript` (constitution Principle IV).

## R8. Testing strategy

- **Backend**: existing `bare_repo` fixture (local bare repo + `file://` URL) drives
  everything — no network, no GitHub. New tests: R1 reproduction/regression trio
  (up-to-date multi-year preview; stale-clone reset; FR-004 filter-active scenario),
  digest pinning (409 on drift), history payload (markers, paging, rewritten flag),
  compatibility classification (missing required column → incompatible), partial
  publish (hybrid CSV = base + staged ops; unstaged reappear), selective apply with
  dependency auto-include, checkout round-trip (older commit → DB matches snapshot →
  publish → new forward commit). Test-first per constitution Principle V.
- **Frontend**: RTL — footer DOM order (US2), staging interactions incl. zero-staged
  disable + tri-scope toggles, graph rendering states (loading / error / rewritten
  banner / disabled incompatible node with gated tooltip), legacy buttons absent with
  graph actions present. JSDOM suffices (no pixel-geometry claims in this feature; the
  memory rule about real-browser geometry locks applies only if visual-geometry issues
  emerge).

## Resolved decisions summary

| # | Decision |
|---|---|
| R1 | Clone = disposable cache: fetch + hard-reset before every sync op; preview→confirm pinned by `base_commit` + `diff_digest`; reproduction-first TDD |
| R2 | Shared `ClientPaginationFooter` (info left; size selector then pagination, right) replacing antd built-in pagination in ChangePreviewTable |
| R3 | `GET /sync/history/` from `git log` (paged, 50) + custom React commit-rail component; no new deps |
| R4 | `SyncConfig.local_state_commit` + `last_known_remote_commit`; rewritten = stored remote sha no longer ancestor of new head |
| R5 | Transient staging via `excluded[]` + digest; partial publish = base rows + staged ops; selective apply in topo order; server-side FK auto-include closure |
| R6 | Checkout generalizes apply (legacy apply endpoints removed); compatibility = header-row validation per registered table via `git show` |
| R7 | API per contracts/sync-api.md; OpenAPI + generated types regenerated |
| R8 | bare_repo-fixture pytest suite (test-first) + RTL suites; no e2e needed |
