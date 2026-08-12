# Quickstart: Quick Search (019) — manual verification

Prereqs: local stack up (`docker compose -f docker-compose.local.yml up` or `pnpm dev` + backend on :8001), logged in.

## 1. Core search (US1 — P1)

1. Open **Inventory → Catalog**. Note the toolbar now ends with a search input stretching to the row's right edge, after the Columns button.
2. Type a fragment you know appears in one item's name (e.g. `MUJI`). Without pressing Enter, the table narrows as you pause typing; the footer count drops to the matched rows.
3. Type a fragment that only appears in a **custom parameter** value (e.g. a color like `土黃`) — rows whose parameters match appear even though no built-in column contains the text.
4. Clear the input (× button). The full list returns exactly as before — same page size, sort, filter.
5. Repeat step 2 with a CJK fragment and with a price fragment (e.g. `129`) — both match.
6. Type `100%` — treated literally; no wildcard behavior.

## 2. View scoping (US2 — P2)

1. On the catalog, open a saved view whose filter admits a subset (or create one: filter `obtained_at ≥ 2026-01-01`, save as "2026").
2. Search for a term that exists both inside and outside the view's scope. Only in-scope rows appear.
3. Open a second view tab, type a different query there. Switch back to the first tab — its query and results are restored; switch again — the second tab's query is restored.
4. While searching: **no unsaved-changes dot appears on any tab, and the URL gains no parameters.** Save the view — reopen it later: no search term was stored.
5. Change the view's filter with a search active — results honor both.

## 3. Highlighting (US3 — P3)

1. Search a fragment visible in the Name column: the fragment renders highlighted (`<mark>`) inside the cell — including inside the Item cell's name/spec and parameter tags.
2. Hide the column containing the match (Columns panel): the row remains listed, now without a highlight.
3. A query matching several visible columns highlights each occurrence.

## 4. Throttling (US4 — P3)

1. Open devtools → Network, filter `search=`. Type a 10-character query in one quick burst: observe 1–2 requests, not 10.
2. The final results always correspond to the full text in the box.

## 5. Uniformity (FR-012)

Repeat §1 steps 2/4 on **Finance → Currencies**, **Accounts**, **Exchange Rates** (search `31.05` or a date fragment `2026-07` — numeric/date matching), and **Inventory → Scenarios** (search a word from a description — matches even though description is not a filterable field).

## 6. Regression sweep

- Filter/Sort/Columns panels still apply-gate correctly with a search active; typing in search while a panel is open+dirty does not discard the panel.
- Catalog: searching while in tree mode flattens the rows (acquisition grouping suspended), clearing the search returns to tree mode.
- Reload mid-search: the query is gone (per-visit), the view arrives clean — no dot, no URL params.

## Automated equivalents

- Backend: `uv run pytest tests/test_entity_search.py` (and full suite).
- Frontend: `pnpm test` (hook + page suites), `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- E2E: `pnpm test:e2e --grep "quick-search"` — run by a human against the dev stack (real data; standing rule).
