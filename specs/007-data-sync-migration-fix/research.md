# Research: Data Sync Migration Fix & Publish Preview

## Bug Root Cause: Missing `apps.py` Files

**Decision**: Register `language`, `music`, and `people` models in the `data_io` registry by adding `apps.py` to each app, following the `finance/apps.py` pattern exactly.

**Rationale**: The registry in `data_io/registry.py` is already fully dynamic — `get_registry()` returns all registered tables at runtime. The bug is that three apps never call `register()` because they have no `AppConfig.ready()` hook. Adding `apps.py` to each app with correct `TableDescriptor` registrations is the minimal, non-breaking fix.

**Alternatives considered**:
- Auto-discovery via `apps.get_models()` loop: Rejected — the `TableDescriptor` requires metadata (display_name, system_fields with typed FieldDescriptors, import_order, FK relationships) that cannot be derived from Django model introspection without significant additional complexity and convention-setting.
- Modifying `data_io/registry.py` to scan all installed apps: Rejected — same reason; metadata is not introspectable.

---

## Field Types for Missing Models

**Decision**: Use the following `data_type` mappings for the missing model fields:

| Django field type | CSV data_type | Notes |
|---|---|---|
| AutoField / BigAutoField | `integer` | Serialized as string repr of int; Django ORM accepts string "1" for pk=1 filter |
| CharField / TextField | `string` or `text` | `string` for short single-line; `text` for long content |
| PositiveSmallIntegerField | `integer` | Same as int |
| JSONField(default=list) | tags field uses `is_json=True` | Serialized via `json.dumps(val)` in csv_exporter |
| EmailField | `string` | Serialized as plain string |
| ForeignKey (int PK) | `integer`, `is_fk=True` | FK column_name is `{field}_id` (Django convention) |
| auto_now_add / auto_now | **excluded** | Matches finance convention — auto-managed timestamps not in CSV schema |

**Rationale**: `_serialize_value()` in `csv_exporter.py` handles all these types via `str(val)` fallback for integers and `json.dumps(val)` for JSON. The `csv_importer.py` FK validation uses `model.objects.filter(pk=value).exists()` which accepts a string representation of an integer PK. No changes needed to either exporter or importer.

---

## Integer PKs and Cross-Device Sync

**Decision**: Register integer-PK models as-is (no NanoID migration for this feature). Use `data_type="integer"` for PK FieldDescriptors.

**Rationale**: The sync strategy is "full replace" (truncate-then-reimport in a single transaction via `import_from_clone`). After an apply, all records in the local DB are replaced with exactly the rows from the remote snapshot, including their PKs. This means integer PK collisions between devices are resolved by the full replace — device B's IDs are overwritten with device A's IDs after applying. There is no record-level merge, so auto-increment ID conflicts are not a problem for the sync use case.

**Alternatives considered**: Migrating to NanoID PKs for language/music/people models. Rejected — out of scope, requires new migrations and potential FK cascade updates, and is a larger refactor than this issue warrants.

---

## Publish Preview: Comparison Strategy

**Decision**: Implement `preview_publish_against_head(clone_dir)` in `publish_helper.py`. For each registered table: (1) export current DB to CSV (in-memory via `export_table()`), (2) parse exported CSV into a row-dict keyed by PK, (3) read last committed HEAD CSV via `git show HEAD:{filename}`, (4) parse HEAD CSV into a row-dict keyed by PK, (5) compute added/modified/deleted counts by comparing the two dicts.

**Rationale**: This approach is purely read-only — it does not stage, commit, or modify the clone directory. It reuses existing `export_table()` and `parse_csv()` utilities. It gives a correct preview of "what will change on the remote when I publish now" without any side effects.

**Alternatives considered**:
- Stage changes and diff via `git diff --cached`: Rejected — staging has side effects; requires cleanup if user cancels, introduces race condition risk.
- Use `compute_diff(local_rows, descriptor)` with a mock "virtual DB": Rejected — `compute_diff` always reads from the live DB via the ORM; adapting it to use a different source requires significant refactoring.
- Return full row-level diff (like apply preview with `rows: ChangeRecord[]`): Rejected — the spec defines count-level summary only, not individual record details. Full row diff adds response payload size with no UX benefit for publish confirmation.

---

## First-Ever Publish Edge Case

**Decision**: When `git show HEAD:{filename}` fails because the clone has no commits yet (empty repository), treat the entire local table as "all added." The preview shows `added = len(local_rows)`, `modified = 0`, `deleted = 0`.

**Rationale**: The status endpoint already handles the "no_remote" case. The clone either has no commits (fresh clone of an empty repo) or has at least one HEAD. `git show HEAD:{filename}` returning a non-zero exit code unambiguously means the file doesn't exist in the committed tree, which for a fresh clone means all local records are new.

---

## Publish Preview: "Up to Date" Detection

**Decision**: If the total of all adds + modifies + deletes across all tables is 0, the endpoint returns `{"status": "up_to_date"}` and the frontend shows an info toast — same pattern as the existing apply preview.

**Rationale**: Matches the UX pattern already established for apply preview. No separate "nothing changed" endpoint needed.

---

## Tables Excluded from Publish Preview

**Decision**: Tables that exist only on the remote (orphaned CSVs from removed domains) are ignored by the publish preview. The preview only iterates the current local registry.

**Rationale**: The publish snapshot is derived from `get_registry()` which reflects only the current local domain state. Orphaned tables on the remote will be implicitly removed by the next publish (since `git add -A` stages deletions). The preview correctly shows that these tables will have 0 changes since they're not in the local registry; they'll simply disappear from the remote on next publish.

**Note**: This is an edge case acknowledged in the spec that does not require special handling beyond what the registry already provides.

---

## Import Order for New Registrations

**Decision**: Assign import orders as follows, in dependency-topological order after the existing finance tables (max existing = 6):

| Table | Import Order |
|---|---|
| `language.language` | 10 |
| `language.wordcard` | 11 (depends on language.language) |
| `language.grammarsheet` | 12 (depends on language.language) |
| `music.song` | 20 |
| `people.person` | 30 |
| `people.relationship` | 31 (depends on people.person × 2) |

**Rationale**: Gaps between groups (10, 20, 30) allow future intra-domain tables to be inserted without renumbering. FK dependencies are respected: WordCard and GrammarSheet reference Language; Relationship references Person twice.

---

## Frontend: Publish Flow Update

**Decision**: Add a publish preview step between the "Publish" button click and the actual API call. Pattern: click Publish → call `GET /api/v1/sync/publish/preview/` → show inline preview with per-table counts + "Confirm Publish" and "Cancel" buttons → on Confirm → call existing `POST /api/v1/sync/publish/`.

**Rationale**: Inline preview (not a Modal) is consistent with the existing apply preview UX in `SyncTab/index.tsx`. The apply preview uses a Collapse component below the buttons; the publish preview will use the same position with a compact table showing counts.

**Alternatives considered**:
- Modal confirmation dialog: Possible but deviates from the inline apply preview pattern. Rejected for consistency.
- Change `POST /api/v1/sync/publish/` to return a preview first (two-step same endpoint): Rejected — complicates the endpoint semantics and makes it non-idempotent.

---

## Localization Keys (New i18n Keys)

The following new keys are needed in both `en-US/pages.ts` and `zh-TW/pages.ts`:

| Key | en-US value |
|---|---|
| `pages.io.sync.publishPreview.button` | "Preview Changes" |
| `pages.io.sync.publishPreview.confirmButton` | "Confirm & Publish" |
| `pages.io.sync.publishPreview.cancelButton` | "Cancel" |
| `pages.io.sync.publishPreview.upToDate` | "Nothing to publish — already up to date." |
| `pages.io.sync.publishPreview.error` | "Failed to compute publish preview." |
| `pages.io.sync.publishPreview.added` | "Added" |
| `pages.io.sync.publishPreview.modified` | "Modified" |
| `pages.io.sync.publishPreview.deleted` | "Deleted" |
| `pages.io.sync.publishPreview.noChanges` | "No changes" |

**Note**: The existing "Publish" button (`pages.io.sync.publish.button`) is repurposed to trigger the preview instead of publishing directly. Its label can remain "Publish" — the preview appears inline before the user confirms.
