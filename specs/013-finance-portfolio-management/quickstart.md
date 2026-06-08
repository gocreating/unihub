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

### Delete confirmation (NON-NEGOTIABLE)
```tsx
Modal.confirm({
  title: formatMessage({ id: 'common.deleteConfirm.title' }),
  content: formatMessage({ id: 'pages.finance.assets.deleteConfirm.content' }, { name: record.name }),
  okType: 'danger',
  onOk: () => deleteMutation.mutate(record.id),
});
```
