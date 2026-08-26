# Quickstart: Finance Portfolio Management

**Phase 1 output** | Branch: `013-finance-portfolio-management`

---

## Development Environment

### Backend

```bash
cd apps/unihub/backend
uv run python manage.py migrate          # apply new migrations
uv run python manage.py runserver        # dev server on :8000
```

### Frontend

```bash
cd apps/unihub/frontend
pnpm install                              # install deps (if needed)
pnpm dev                                  # dev server on :5173
```

### Quality Loop (run after every change)

**Backend** (from `apps/unihub/backend/`):
```bash
uv run ruff format .
uv run ruff check . --fix
uv run pytest
```

**Frontend** (from `apps/unihub/frontend/`):
```bash
pnpm lint
pnpm typecheck
pnpm test
```

### Regenerate OpenAPI types (after any backend serializer/viewset change)

```bash
# from apps/unihub/backend/
uv run python manage.py spectacular --file openapi.yaml
# from apps/unihub/frontend/
pnpm openapi-ts
```

---

## Implementation Order

Follow this sequence — each step builds on the previous.

1. **Backend models** — `models.py`: Add `Asset`, `Portfolio`, `Transaction`, `Transfer` and signals
2. **Migration** — `makemigrations finance` and `migrate`
3. **Backend tests (write first)** — `tests/finance/test_assets.py`, `test_portfolios.py`, `test_transactions.py`
4. **Backend serializers** — `serializers.py`
5. **Backend views** — `views.py`
6. **Backend URLs** — `urls.py` + `unihub/urls.py`
7. **Verify backend quality loop passes**
8. **Regenerate OpenAPI schema**
9. **Frontend i18n keys** — `locales/en-US/pages.ts` + `locales/zh-TW/pages.ts`
10. **Frontend service** — `services/unihub-backend/finance.ts`
11. **Frontend pages** — `pages/finance/assets/`, `portfolios/`, `transactions/`
12. **Router + nav** — add routes and AppShell nav items
13. **Verify frontend quality loop passes**

---

## Key Implementation Notes

### Portfolio `base_currency` immutability
- Use `PortfolioCreateSerializer` (includes `base_currency`) and `PortfolioUpdateSerializer` (excludes it) as separate classes; register both in the viewset via `get_serializer_class()`.

### Transaction atomicity
- Wrap `TransactionSerializer.create()` and `update()` in `django.db.transaction.atomic()`.
- On `update()`: delete existing transfers (`instance.transfers.all().delete()`), then create new from payload.

### Portfolio timestamp signals
- Register `post_save` and `post_delete` signals on `Transaction` in `finance/apps.py` `ready()` method.
- Signal calls `portfolio.refresh_transaction_times()` which does one `aggregate()` + one `update()`.

### ProtectedError → 409
```python
from django.db.models import ProtectedError

def destroy(self, request, *args, **kwargs):
    try:
        return super().destroy(request, *args, **kwargs)
    except ProtectedError:
        return Response({'detail': '...'}, status=status.HTTP_409_CONFLICT)
```

### Expandable transfer rows (frontend) — SUPERSEDED in iteration 4

The nested-`ProTable`-in-`expandedRowRender` pattern is gone (FR-022). Transfers
are child ROWS of the transactions table sharing its columns, following the
inventory catalog:

```tsx
// Rows are a union; children hang off the transaction.
const rows = transactions.map((txn) => ({
  ...txn,
  rowType: 'transaction' as const,
  children: txn.transfers.map((tr) => ({ ...tr, rowType: 'transfer' as const })),
}));

<PageTable<TxnRow>
  rowKey={rowKeyOf}            // `${rowType}:${id}` — PKs are not unique across the union
  dataSource={rows}
  columns={columns}            // ONE column set; each renderer switches on rowType
  columnEmptyText={false}
  indentSize={0}
  expandable={{ showExpandColumn: false, expandedRowKeys }}
/>
```

A dedicated `__caret` column (width 44, `data-row-link-ignore`) owns the
toggle. Collapsed parents summarise: transfer count in the Asset column, net
value change — summed with `Decimal`, never `Number` — in Value Change.

### Value Change field label
When rendering the Transfer form inside a transaction, derive the portfolio's `base_currency` from the selected transaction's portfolio and display the Value Change field label as:
```tsx
label={formatMessage({ id: 'pages.finance.transactions.valueChange' }, { currency: portfolio.base_currency })}
// en-US: "Value Change ({currency})"
// zh-TW: "價值變動（{currency}）"
```

### Delete confirmation (NON-NEGOTIABLE — superseded in iteration 3)
`Modal.confirm` is banned since 016 round 5. Use the shared dialog:
```tsx
import { confirmDialog } from '@/components/ConfirmDialog';

confirmDialog({
  title: formatMessage({ id: 'pages.finance.assets.delete.title' }),
  content: formatMessage({ id: 'pages.finance.assets.delete.confirm' }, { name: record.name }),
  danger: true,
  onOk: () => deleteMutation.mutateAsync(record.id),
});
```

---

# Iteration 3 Runbook (2026-08-13)

## Legacy import (Story 4)

The four CSVs live in `migration/` at the repo root — **untracked; never commit them** (real personal financial data, FR-012h).

```bash
# Local dev database
cd apps/unihub/backend
uv run python manage.py migrate                       # applies 0012
uv run python manage.py import_legacy_finance ../../../migration

# Running docker stack (real data) — after rebuilding images from this branch.
# The entrypoint migrates on boot, so `up -d --build` applies 0012 for you.
docker compose -f apps/unihub/docker-compose.local.yml up -d --build
docker cp migration unihub-backend-1:/tmp/migration
docker exec unihub-backend-1 /app/.venv/bin/python manage.py import_legacy_finance /tmp/migration
docker exec unihub-backend-1 rm -rf /tmp/migration     # don't leave the CSVs in the container
```

`python manage.py` inside the container fails with `ModuleNotFoundError: No module named 'django'` — dependencies live in the image's venv, so management commands must be invoked as `/app/.venv/bin/python`.

Expected report: `assets: 38 created / 0 skipped · portfolios: 55 · transactions: 359 · transfers: 837`. Currencies report `0 created` when TWD/USD already exist — the command only ever `get_or_create`s them. A second run must report all-skipped and change nothing (SC-003).

**Take a backup first** — the import writes ~1,300 rows into the real database:

```bash
docker exec unihub-db-1 pg_dump -U unihub -d unihub > unihub-pre-import.sql
```

### Executed 2026-08-14 (T026)

Ran against the live stack. Backup taken (1.3 MB), then: 38 / 55 / 359 / 837 created, currencies 0 (TWD+USD already present), re-run all-skipped. Totals after import: assets 40 (2 pre-existing test rows kept), portfolios 55 (5 active / 50 closed), transactions 359, transfers 837; accounts (37) and inventory items (1014) untouched. `GET /api/v1/finance/transactions/?filters=<portfolio eq JD2Wf2BF>` returned **HTTP 200 with 49 rows** — the reported 500 is gone — and `&search=手續費` narrowed it to 12.

## Verification checklist

1. Portfolio detail page for `[Active] 永豐 DCA TW.00918` → Transactions panel lists rows (500 fixed), description shows the DCA schedule, state Active.
2. A DCA buy expands to 3 transfers: two value-only TWD rows (one remarked 手續費) and one +N shares row with blank Value Change.
3. Wei-scale amounts render exactly (e.g. −0.000000067305900768 ETH), not rounded to 8dp.
4. Assets & Portfolios pages show view tabs + quick search identical to Currencies/Accounts; no `Modal.confirm` anywhere under `pages/finance/assets|portfolios`.
5. Re-run import → all skipped; counts unchanged.

---

# Iteration 4 verification (2026-08-15) — constitution v1.25.0

Read-only Playwright probe against the running stack with real data, after
rebuilding the frontend image. **14/14 checks passed**:

- Portfolios list: no Actions column (`Name | Description | Base Currency |
  State | Last Transaction | First Transaction`), no View button, no
  Close/Reopen; rows show `cursor: pointer`; **Ctrl+click opened
  `/finance/portfolios/AcAN8qJU` in a new tab without navigating in place**;
  a plain click navigated to the detail page.
- Portfolio panel: `Descriptions` carries Name, Base Currency, State,
  Description, First/Last Transaction; header shows `Close` and `Edit` with
  Delete in the kebab; narrowing the panel reflowed 2 rows → 3 rows.
- Transactions: a collapsed row summarised `1 transfer` with its net value;
  expanding added child rows to the SAME table (22 → 23 rows) with the
  header count unchanged at 1 — no nested table.
- Balance sheets: no View action; clicking Delete opened the shared confirm
  dialog and did NOT navigate (SC-008). The dialog was cancelled.

**Docker gotcha worth repeating**: `docker compose up -d --build frontend`
rebuilt the image but left the container on the OLD one (it reported
`Running`, not `Recreated`), so the probe initially tested stale code. Verify
with `docker inspect unihub-frontend-1 --format '{{.Image}}'` against
`docker image inspect unihub-frontend --format '{{.Id}}'`, and force it with
`--force-recreate --no-deps` when they differ.

---

# Iteration 5 verification (2026-08-16) — constitution v1.26.0

Both containers rebuilt with `--force-recreate --no-deps` (container image id
compared against the built image id first — the iteration-4 gotcha); migration
0013 confirmed applied.

**UI probe against real data — 7/7 passed**

- Portfolios list ships **without** the description column
  (`Name | Base Currency | State | Last Transaction | First Transaction`) and
  it appears once revealed through the Columns control.
- **SC-011**: all 8 non-empty description cells render at **2 lines, clamp: 2,
  with zero horizontal overflow** in a 280px column. Before the fix the same
  cells wrapped to 3 lines with 356px of content in that 280px cell.
  (Row height stays 69px because the First/Last Transaction columns render
  `DateTimeCell`'s two rows by design — the constitution exempts those.)
- **SC-013**: the footer reads **"49 transactions, 75 transfers"**.
- Charts: tabbed card `Waterfall | Breakdown by asset`, SVG-rendered, both
  tabs draw.

**API probe on a scratch SQLite DB (never the real one) — 8/8 passed**

Multi-line description accepted; while closed, CREATE / EDIT / DELETE of a
transaction and EDIT of the portfolio all return 400; **reopening returns 200**
and editing works again afterwards — the case a naive "reject all writes when
closed" guard bricks.

---

# Iteration 6 verification (2026-08-16) — PnL, holdings, headers

Containers rebuilt and force-recreated (ids compared first). **13/13 passed.**

- **API**: `JD2Wf2BF` reports `invested -474391 / returned null / net -474391`,
  matching the direct SQL sum over all 49 transactions — proving the aggregate
  is server-side and not a page-sized frontend sum.
- **SC-014**: the Transactions header row is now
  `["", "Time", "Description", "Asset", "Asset Change", "Value Change (TWD)", "Remark", "Actions"]`
  — exactly one blank, the caret. It was 6 blanks before.
- **SC-016**: on the open portfolio the Descriptions labels are
  `… | Invested | Returned | Net invested` with **no label containing "PnL"**;
  a closed portfolio shows `Realized PnL` and no "Net invested".
- **SC-015**: −474,391 TWD is displayed, never described as a loss; the
  no-price-feed note is present.
- List: the `PnL / Net` column renders per-row currency with a realized/net
  marker (e.g. `-18647.12007343 USD net`).

## Follow-up worth a decision (observed during verification)

The holdings line for the DCA portfolio reads
`大華優利高填息30 × 20029, 新台幣 × -474391`. The negative 新台幣 (TWD) entry is
arithmetically correct — cash legs are transfers of the TWD *asset*, a
consequence of the iteration-3 "port legacy data as-is" decision — but as a
"Still holding" line it restates the Invested figure as a negative holding.
Options if it grates: exclude assets that are also Currency codes from
holdings, or keep them for fidelity. Not changed unilaterally: it follows from
a decision the user made deliberately.

---

# Iteration 9 verification plan (2026-08-25) — chart polish, badges, accumulated columns

Frontend-only. Rebuild AND force-recreate the frontend container (compare
`docker inspect unihub-frontend-1 --format '{{.Image}}'` with
`docker image inspect unihub-frontend --format '{{.Id}}'` first), or run
`pnpm dev --port 3002` against the real backend for a GET-only probe.

```bash
# from apps/unihub/frontend/
pnpm lint && pnpm typecheck && pnpm test && pnpm build
# from apps/unihub/backend/ (nothing changes, but the loop is the loop)
uv run ruff check . && uv run pytest
```

**Checklist (real data, read-only):**

- **SC-023** — Portfolios list header row has no blank cell: `Name | PnL | Position`.
  A `resolveAutoWidths` test proves a column with `autoWidth.header` and no
  `title` still renders the header.
- **SC-027** — Position cells render one `<Tag>` per held asset; inside each,
  the quantity and the asset name are different tones (probe the computed
  `color` of the two spans). Same on a transaction row's Accumulated Position.
- **SC-024** — open a crypto portfolio whose purchases were paid in USDT
  (the ones that plotted negative grey bars): every cost-only transaction now
  plots a positive Position bar; the option has one `yAxis`. Assert on the
  option from `trendOption` in tests: `position === -(cost + income)` for
  every point.
- **SC-025** — for each of the three >25-transaction portfolios
  (`SELECT portfolio_id, count(*) FROM finance_transaction GROUP BY 1 HAVING count(*) > 25`):
  the newest row's Accumulated PnL equals `GET /portfolios/{id}/` →
  `net_value_change`, and the PnL curve's last point equals it. Also flip the
  table to page 2 and re-sort ascending — the accumulated figures must not
  change with the page.
- **SC-026** — hover both charts: bold date title, then rows
  `● Cost  − NT$ 1,234` etc. with the symbol and normalizer precision; the
  tooltip stays inside the chart and does not follow the cursor. Hover the
  Balance Sheets net-worth chart: same box. `grep -r pageNote src/locales`
  returns nothing.
- **FR-054** — PnL tab shows no "PnL:" line and no "Still holding" line; the
  ⓘ in the tab bar shows the realized note on a closed portfolio and the
  no-prices note on an open one; the ⓘ is absent on the Trend tab (the
  Waterfall toggle sits there instead).
- **FR-056** — header row reads
  `["", "Time", "Accumulated PnL", "Accumulated Position", "Tx PnL Change", "Tx Position Change", "Description", "Actions"]`;
  expand a transaction: the parent row's two Tx cells are empty, each transfer
  row's two Accumulated cells are empty.

## Executed 2026-08-25 (T620) — 25/25 passed

Frontend image rebuilt from this worktree (`a7bf6a35436a`) and the container
force-recreated (ids compared before and after; the served bundle contains
"Accumulated PnL"). Read-only Playwright probe against the real data:

- **SC-023**: Portfolios headers `["Name","PnL","Position"]` — no blank cell.
- **SC-027**: Position cells render one `.ant-tag` per asset; inside a tag the
  quantity is `rgba(0,0,0,0.88)` and the asset name `rgba(0,0,0,0.45)`.
  Multi-asset rows (up to 4 tags) wrap within the cell.
- **FR-056**: header row exactly
  `["", "Time", "Accumulated PnL", "Accumulated Position", "Tx PnL Change", "Tx Position Change", "Description", "Actions"]`;
  parent rows leave both Tx cells empty; expanded transfer rows leave both
  Accumulated cells empty and show `− NT$ 6,554` / `+65 元大台灣50`.
- **SC-025** (the three >25-transaction portfolios, all TWD): newest row's
  Accumulated PnL = `− NT$ 347,264` (xUCeWNsp, 53 txns), `− NT$ 474,391`
  (JD2Wf2BF, 49), `− NT$ 442,760` (P7cnm6zu, 48) — each equal to the direct
  SQL sum over ALL transfers. A page-scoped sum would have shown −163,824 /
  −254,997 / −226,018. Page boundaries also match SQL: the 25th-newest row
  reads −190,012; sorted ascending, the oldest row reads its own −6,528 and
  the 25th-oldest −163,778 — sort order does not move an accumulated figure.
- **FR-054**: no "Still holding" and no "Charted from" text anywhere on the
  page; the ⓘ in the tab bar carries the no-prices note on an open portfolio
  and is absent on the Trend tab (the Bars/Waterfall toggle sits there).
- **SC-026**: PnL tooltip `2025-12-16 | ● PnL − NT$ 203,175`; Trend tooltip
  `2025-10-16 | ● Cost − NT$ 6,573 | ● Position + NT$ 6,573`; Balance Sheets
  net-worth tooltip `2026-05-01 | ● Net Worth NT$ 2,426,802.29` — all three
  the same bold-date + table shape from the one builder, pinned to the axis.
- **SC-024**: the DCA portfolio's Trend tab plots 52 grey position bars, all
  ABOVE the axis, mirroring the red cost bars below it, on one NT$ axis.

**Quality loop**: lint, typecheck and `pnpm build` clean; backend ruff clean,
619 pytest passed. Full `pnpm test`: 1011 passed, 3 timed out under
full-suite load in files this iteration does not touch
(`SyncTab.actions.test.tsx` ×2, `BalanceSheetEditPage.test.tsx` ×1) — all
three pass when their files run alone (11/11).

**Worth knowing (observed, not changed)**: `[Active] Bitfinex Lending` now
reads `−18,647.12007343 USDT` in Position. The iteration-8 badge text showed
`18,647.12…` because `<Price>` dropped the minus on an unsigned BALANCE (only
the plus is meant to be omitted); the normalizer fix in this iteration keeps
it. The negative net is real — the portfolio's USDT legs are recorded as
outflows — and matches its `− $ 18,647.12` PnL.
