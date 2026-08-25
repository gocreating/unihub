# API Contract: Finance Portfolio Management

**Phase 1 output** | Branch: `013-finance-portfolio-management`

Base URL prefix: `/api/v1/finance/`

All endpoints require session authentication. All list responses use `EntityOffsetPagination` (`{count, next, previous, results}`). All decimal fields are serialized as strings.

---

## Assets

### `GET /api/v1/finance/assets/`

List all assets.

**Query params**: `filters` (JSON), `ordering`, `limit`, `offset`

**Response 200**:
```json
{
  "count": 12,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "abc123def456",
      "name": "Apple Inc.",
      "category": "Stock",
      "created_at": "2026-06-08T10:00:00Z",
      "updated_at": "2026-06-08T10:00:00Z"
    }
  ]
}
```

### `POST /api/v1/finance/assets/`

Create an asset.

**Request body**:
```json
{ "name": "Apple Inc.", "category": "Stock" }
```

**Response 201**: asset object

**Errors**:
- `400`: `name` missing or blank

### `PATCH /api/v1/finance/assets/{id}/`

Update an asset's name or category.

**Request body**: any subset of `{ "name", "category" }`

**Response 200**: updated asset object

**Errors**:
- `404`: asset not found

### `DELETE /api/v1/finance/assets/{id}/`

Delete an asset.

**Response 204**: no content

**Errors**:
- `404`: asset not found
- `409`: asset is referenced by one or more transfers; body: `{ "detail": "Cannot delete asset: it is referenced by existing transfers." }`

---

## Portfolios

### `GET /api/v1/finance/portfolios/`

List all portfolios. Default ordering: `-last_transaction_time` (nulls last), then `-created_at`.

**Query params**: `filters` (JSON), `ordering`, `limit`, `offset`

**Response 200**:
```json
{
  "count": 3,
  "results": [
    {
      "id": "prt000000001",
      "name": "Tech Holdings",
      "base_currency": "USD",
      "state": "active",
      "first_transaction_time": "2024-01-15T09:30:00Z",
      "last_transaction_time": "2026-06-01T14:20:00Z",
      "created_at": "2024-01-10T08:00:00Z",
      "updated_at": "2026-06-08T10:00:00Z"
    }
  ]
}
```

### `POST /api/v1/finance/portfolios/`

Create a portfolio. `base_currency` is set here and never changeable.

**Request body**:
```json
{ "name": "Tech Holdings", "base_currency": "USD", "state": "active" }
```

**Response 201**: portfolio object

**Errors**:
- `400`: `name` or `base_currency` missing; `base_currency` code does not exist in currencies table

### `PATCH /api/v1/finance/portfolios/{id}/`

Update a portfolio. `base_currency` is read-only and ignored if sent.

**Request body**: any subset of `{ "name", "state" }`

**Response 200**: updated portfolio object

**Errors**:
- `404`: portfolio not found

### `DELETE /api/v1/finance/portfolios/{id}/`

Delete a portfolio.

**Response 204**: no content

**Errors**:
- `404`: portfolio not found
- `409`: portfolio has associated transactions; body: `{ "detail": "Cannot delete portfolio: it has associated transactions." }`

---

## Transactions

Transfers are nested within each transaction response. There is no standalone Transfers endpoint.

### `GET /api/v1/finance/transactions/`

List all transactions across all portfolios (or filtered by portfolio).

**Query params**: `filters` (JSON including `portfolio` exact filter), `ordering`, `limit`, `offset`

**Response 200**:
```json
{
  "count": 42,
  "results": [
    {
      "id": "txn00000001",
      "portfolio": "prt000000001",
      "portfolio_name": "Tech Holdings",
      "timestamp": "2026-06-01T14:20:00Z",
      "description": "Buy AAPL",
      "transfers": [
        {
          "id": "trf00000001",
          "asset": "ast000000001",
          "asset_name": "Apple Inc.",
          "asset_change_amount": "10.00000000",
          "value_change": "-1520.00000000",
          "created_at": "2026-06-08T10:00:00Z",
          "updated_at": "2026-06-08T10:00:00Z"
        },
        {
          "id": "trf00000002",
          "asset": "ast000000002",
          "asset_name": "USD Cash",
          "asset_change_amount": "-1520.00000000",
          "value_change": null,
          "created_at": "2026-06-08T10:00:00Z",
          "updated_at": "2026-06-08T10:00:00Z"
        }
      ],
      "created_at": "2026-06-08T10:00:00Z",
      "updated_at": "2026-06-08T10:00:00Z"
    }
  ]
}
```

**Notes**:
- `transfers` always included in list response (no lazy load needed at personal scale).
- `portfolio_name` is a denormalized read-only field for display.
- `asset_name` in each transfer is denormalized for display.
- `value_change` is `null` for pure position-change transfers.

### `POST /api/v1/finance/transactions/`

Create a transaction with its transfers atomically.

**Request body**:
```json
{
  "portfolio": "prt000000001",
  "timestamp": "2026-06-01T14:20:00Z",
  "description": "Buy AAPL",
  "transfers": [
    { "asset": "ast000000001", "asset_change_amount": "10", "value_change": "-1520" },
    { "asset": "ast000000002", "asset_change_amount": "-1520", "value_change": null }
  ]
}
```

**Response 201**: full transaction object with nested transfers

**Errors**:
- `400`: `portfolio` or `timestamp` missing; `transfers` empty; `asset_change_amount` missing on any transfer
- `400`: portfolio is closed — `{ "portfolio": ["Cannot add a transaction to a closed portfolio."] }`

### `PATCH /api/v1/finance/transactions/{id}/`

Update a transaction. Full-replace strategy for `transfers`: all existing transfers are deleted and replaced by the new list.

**Request body**: any subset of `{ "timestamp", "description", "transfers" }`

**Response 200**: updated transaction object with nested transfers

**Errors**:
- `404`: transaction not found
- `400`: `transfers` list provided but empty

### `DELETE /api/v1/finance/transactions/{id}/`

Delete a transaction and all its transfers (cascade).

**Response 204**: no content

**Errors**:
- `404`: transaction not found

---

## URL Registration

Added to `unihub/urls.py` under `/api/v1/finance/`:

```python
router.register(r'assets', AssetViewSet, basename='asset')
router.register(r'portfolios', PortfolioViewSet, basename='portfolio')
router.register(r'transactions', TransactionViewSet, basename='transaction')
```

---

# Iteration 3 Contract Amendments (2026-08-13)

All list endpoints below additionally accept the `search` query param (019 quick search): case-insensitive substring matched against the viewset's `searchable_fields`, ANDed with `filters`.

## Assets — `category` REMOVED

- `GET/POST/PATCH /api/v1/finance/assets/`: the `category` field no longer exists in requests or responses. `POST { "name": "..." }`.

## Portfolios — `description` added

- All portfolio payloads/responses gain `"description": string` (optional, default `""`), writable on create and update:

```json
{ "id": "xUCeWNsp", "name": "[Active] 永豐 DCA TW.0050", "base_currency": "TWD",
  "description": "每月 06, 16, 26 日 6600 元", "state": "active", ... }
```

## Transactions — `chain_id` / `tx_hash` added; Transfer gains `remark`; decimals widen

```json
{
  "id": "DTz5KwFy",
  "portfolio": "JD2Wf2BF",
  "timestamp": "2024-10-14T00:00:00Z",
  "description": "",
  "chain_id": "",
  "tx_hash": "",
  "transfers": [
    { "id": "VmWrJCMd", "asset": "9AZhkhfw", "asset_name": "大華優利高填息30",
      "asset_change_amount": "419.000000000000000000", "value_change": null, "remark": "" },
    { "id": "yyMzPUtV", "asset": "yRLSZ6Vt", "asset_name": "新台幣",
      "asset_change_amount": "-1.000000000000000000", "value_change": "-1.000000000000000000",
      "remark": "手續費" }
  ]
}
```

- `asset_change_amount` / `value_change` are decimal **strings** with up to 18 fraction digits (`max_digits=38, decimal_places=18`).
- `chain_id` (≤32 chars), `tx_hash` (≤128 chars), `remark` (≤255 chars) are optional, blank by default.

## Filtering contract fix (bug)

`GET /api/v1/finance/transactions/?filters={"groups":[{"logic":"and","conditions":[{"attr":"portfolio","op":"eq","val":"<id>"}]}]}` MUST return 200 with the portfolio's transactions. (Previously 500 — `filterable_fields` declared operators in `lookup`; the current core contract expects ORM field paths.) Same repair applies to the assets and portfolios endpoints.

# Iteration 9 (2026-08-25) — no contract change

The portfolio detail page additionally calls the existing
`GET /api/v1/finance/transactions/?filters=<portfolio eq id>&ordering=timestamp,created_at&limit=500`
to obtain the portfolio's complete transaction set for the Accumulated columns
and the charts (FR-057). `ordering_fields` already allows both fields and the
pagination cap is 500. `GET /portfolios/{id}/holdings/` remains available
(FR-034) but the frontend no longer calls it.
