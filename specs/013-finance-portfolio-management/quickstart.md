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

### Expandable transfer rows (frontend)
```tsx
// In TransactionsPage, pass to PageTable:
expandable={{
  expandedRowRender: (record) => (
    <ProTable
      ghost
      dataSource={record.transfers}
      columns={transferColumns}
      search={false}
      toolBarRender={false}
      pagination={false}
    />
  ),
}}
```

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

# Running docker stack (real data) — after rebuilding images from this branch:
docker compose -f apps/unihub/docker-compose.local.yml up -d --build
docker compose -f apps/unihub/docker-compose.local.yml cp migration unihub-backend-1:/tmp/migration   # or bind-mount
docker compose -f apps/unihub/docker-compose.local.yml exec backend python manage.py import_legacy_finance /tmp/migration
```

Expected report: `assets: 38 created / 0 skipped · portfolios: 55 · transactions: 359 · transfers: 837`. A second run must report all-skipped and change nothing (SC-003).

## Verification checklist

1. Portfolio detail page for `[Active] 永豐 DCA TW.00918` → Transactions panel lists rows (500 fixed), description shows the DCA schedule, state Active.
2. A DCA buy expands to 3 transfers: two value-only TWD rows (one remarked 手續費) and one +N shares row with blank Value Change.
3. Wei-scale amounts render exactly (e.g. −0.000000067305900768 ETH), not rounded to 8dp.
4. Assets & Portfolios pages show view tabs + quick search identical to Currencies/Accounts; no `Modal.confirm` anywhere under `pages/finance/assets|portfolios`.
5. Re-run import → all skipped; counts unchanged.
