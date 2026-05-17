# API Contract: Finance Domain

**Base prefix**: `/api/v1/finance/`

> **Numeric precision**: All decimal values (`amount`, `rate`, net worth totals) are transmitted as **JSON strings**, never as JSON numbers. This preserves exact precision end-to-end. Clients must parse these fields with a Decimal library, not `parseFloat`.

---

## Accounts

### GET /api/v1/finance/accounts/

List all accounts.

**Auth**: Session required

**Query params**:
- `ordering`: `name`, `-name`, `account_type`, `currency`
- `search`: text search on `name`

**Response 200**:
```json
[
  {
    "id": 1,
    "name": "Chase Checking",
    "account_type": "asset",
    "currency": "USD",
    "created_at": "2026-05-17T00:00:00Z",
    "updated_at": "2026-05-17T00:00:00Z",
    "custom_attributes": [
      { "attribute_definition_id": 7, "attribute_name": "Bank", "value": "Chase" }
    ]
  }
]
```

---

### POST /api/v1/finance/accounts/

Create an account.

**Auth**: Session required

**Request body**:
```json
{
  "name": "string",
  "account_type": "asset | liability | equity",
  "currency": "USD"
}
```

**Response 201**: Account object

**Response 400**: Missing required field, invalid `account_type`, invalid ISO 4217 `currency`

---

### GET /api/v1/finance/accounts/{id}/

Retrieve a single account.

**Response 200**: Account object (same shape as list item)

---

### PATCH /api/v1/finance/accounts/{id}/

Update an account's fields.

**Request body** (all fields optional):
```json
{
  "name": "string",
  "account_type": "asset | liability | equity",
  "currency": "USD"
}
```

**Response 200**: Updated account object

**Notes**: Changing `currency` does not modify existing Balance amounts; they are
reinterpreted as the new currency.

---

### DELETE /api/v1/finance/accounts/{id}/

Delete an account.

**Response 204**: No content (cascades to related Balance records)

**Response 400**: If account has balances, returns warning:
```json
{
  "affected_balance_count": 3,
  "message": "Deleting this account will remove 3 balance records."
}
```
Caller must confirm: `DELETE /api/v1/finance/accounts/{id}/?confirm=true`

---

## Balance Sheets

### GET /api/v1/finance/balance-sheets/

List all balance sheets.

**Auth**: Session required

**Query params**:
- `ordering`: `-date` (default), `date`, `label`

**Response 200**:
```json
[
  {
    "id": 1,
    "date": "2026-05-01",
    "label": "May 2026",
    "base_currency": "USD",
    "created_at": "2026-05-17T00:00:00Z",
    "updated_at": "2026-05-17T00:00:00Z"
  }
]
```

---

### POST /api/v1/finance/balance-sheets/

Create a balance sheet.

**Request body**:
```json
{
  "date": "2026-05-01",
  "label": "May 2026",
  "base_currency": "USD"
}
```

**Response 201**: BalanceSheet object

---

### GET /api/v1/finance/balance-sheets/{id}/

Retrieve a single balance sheet.

**Response 200**: BalanceSheet object

---

### PATCH /api/v1/finance/balance-sheets/{id}/

Update a balance sheet.

**Response 200**: Updated BalanceSheet object

---

### DELETE /api/v1/finance/balance-sheets/{id}/

Delete a balance sheet and all its Balance records.

**Response 204**: No content

---

## Balances (nested under Balance Sheet)

### GET /api/v1/finance/balance-sheets/{id}/balances/

List all balances for a balance sheet, grouped by account.

**Response 200**:
```json
[
  {
    "id": 1,
    "account_id": 3,
    "account_name": "Chase Checking",
    "account_type": "asset",
    "currency": "USD",
    "amount": "52340.0000"
  }
]
```

---

### PUT /api/v1/finance/balance-sheets/{id}/balances/{account_id}/

Upsert (create or update) the balance for a specific account in this sheet.

**Request body**:
```json
{ "amount": "52340.00" }
```

**Response 200**: Balance object

**Response 400**: `amount` is not a valid decimal

---

### DELETE /api/v1/finance/balance-sheets/{id}/balances/{account_id}/

Remove the balance entry for this account from the sheet.

**Response 204**: No content

---

## Net Worth Summary

### GET /api/v1/finance/balance-sheets/{id}/net-worth/

Compute the net worth summary for a balance sheet.

**Auth**: Session required

**Response 200**:
```json
{
  "balance_sheet_id": 1,
  "date": "2026-05-01",
  "base_currency": "USD",
  "per_currency": [
    {
      "currency": "USD",
      "total_assets": "150000.0000",
      "total_liabilities": "30000.0000",
      "net_worth": "120000.0000"
    },
    {
      "currency": "TWD",
      "total_assets": "600000.0000",
      "total_liabilities": "0.0000",
      "net_worth": "600000.0000"
    }
  ],
  "base_currency_total": {
    "net_worth": "139230.77",
    "covered_currencies": ["USD", "TWD"],
    "missing_rates": []
  }
}
```

**Response with missing rates**:
```json
{
  "base_currency_total": {
    "net_worth": "120000.0000",
    "covered_currencies": ["USD"],
    "missing_rates": [
      {
        "currency": "TWD",
        "message": "No exchange rate found for TWD → USD on or before 2026-05-01"
      }
    ]
  }
}
```

---

## Exchange Rates

### GET /api/v1/finance/exchange-rates/

List all exchange rates.

**Auth**: Session required

**Query params**:
- `from_currency`: filter by from_currency
- `to_currency`: filter by to_currency
- `ordering`: `-date` (default), `date`, `from_currency`, `to_currency`

**Response 200**:
```json
[
  {
    "id": 1,
    "from_currency": "TWD",
    "to_currency": "USD",
    "rate": "0.03076900",
    "date": "2026-05-01"
  }
]
```

---

### POST /api/v1/finance/exchange-rates/

Create an exchange rate.

**Request body**:
```json
{
  "from_currency": "TWD",
  "to_currency": "USD",
  "rate": "0.030769",
  "date": "2026-05-01"
}
```

**Response 201**: ExchangeRate object

**Response 400**: Duplicate `(from_currency, to_currency, date)`, `rate <= 0`, invalid currency code

---

### PATCH /api/v1/finance/exchange-rates/{id}/

Update a rate value or date.

**Response 200**: Updated ExchangeRate object

---

### DELETE /api/v1/finance/exchange-rates/{id}/

Delete an exchange rate.

**Response 204**: No content
