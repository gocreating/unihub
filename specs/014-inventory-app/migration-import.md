# Legacy Spreadsheet Import — Mapping Spec (`財產們 - 2026.csv`)

**Status**: draft / dry-run. Read-only preview tool at
[`scripts/preview_legacy_import.py`](scripts/preview_legacy_import.py). No DB writes yet.

Goal: migrate the legacy assets spreadsheet into the Inventory app's
`Acquisition` + `Item` + per-currency `CostFactor` model.

## Source columns

| # | Header | Meaning | Target |
|---|--------|---------|--------|
| 1 | 項目 | item name **or** a cost-factor label (退稅/折價/運費) | `Item.name` **or** `CostFactor.type` |
| 2 | 實際支付價錢 | actual amount paid (often `0` for gift/代買) | acquisition's per-currency `accumulated` value (override), or the row's own `CostFactor.value` |
| 3 | 貨幣 | currency code (RMB/USD/TWD) | `CostFactor.currency` / `Item.sku_price_currency` |
| 4 | 購買地點 | store / seller | `Acquisition.source` |
| 5 | 購買日期 | `A`, `A~B`, or `A~` | `request_time` / `obtained_at` |
| 6 | 備註 | multi-line structured free text | parsed into item fields (below), residue → `Item.remark` |

## Grouping rule (acquisition boundaries)

Rows are ungrouped in the source; the importer reconstructs acquisitions:

1. A row **starts a new acquisition** when it has a **購買地點** OR a **購買日期**.
2. When 購買地點 is empty but 購買日期 is present, the source is **inherited** from the
   previous acquisition (flagged `inherited_source` for review).
3. A row with **no location and no date** is an **attachment** to the current acquisition:
   - a **cost factor** if 項目 matches a keyword (退稅/退款/稅→`tax_refund`,
     折價/折扣/優惠/折→`discount`, 運費/運/freight/shipping→`shipping`), else
   - a **continuation item**.

Every item lands under exactly one acquisition (model composition). Blank/summary
rows (`總支出` totals, empty padding) are skipped.

## Cost model mapping

- The header row's **實際支付價錢 + 貨幣** becomes the acquisition's **`accumulated`**
  factor for that currency (an **override** of the derived Σ, because actual-paid
  ≠ Σ original — many rows paid `0`). One accumulated per currency (iteration-5 rule).
- **退稅 / 折價 / 運費** attachment rows become non-accumulated factors on the current
  acquisition; the **value + currency** come from columns 2–3, else parsed from 備註
  (e.g. `折價 … −￥1,450` → `-1450 JPY`; sign taken from a leading `-`/`−`).
- `net_cost` (Total) = per-currency Σ of factor values — validated against the sheet's
  bottom `總支出` rows (199.9 RMB / 687 TWD / 186.22 USD).

## 備註 parsing

| Pattern | → field |
|---------|---------|
| `尺寸：…` | `Item.size` |
| `顏色：…` | `Item.color` |
| `原價：N cur` / `單價：N cur` | `Item.sku_price` (+ `sku_price_currency`; `yen/円/¥/￥`→JPY) |
| `重量：N g` / `淨重：N g` | `Item.weight` (unit g) |
| `長度：N m/cm/mm` | `Item.length` |
| `A x B x C cm` | `Item.length/width/height` |
| `數量：N` / `… * N 件` | `Item.quantity` (integer) |
| product codes / `型號` / anything else | appended to `Item.remark` (no data loss) |

## Currency

`Currency.code` is a user-created 3-char string (no seed). **Decision (2026-07-11):
unihub uses `CNY`, not `RMB`** — the importer MUST normalise **`RMB → CNY`** (an
alias map, extensible) for both item `sku_price_currency` and cost-factor `currency`.
The previously-imported 2026 acquisitions (imported as `RMB`) MUST be **deleted and
re-imported** as `CNY`. Other codes (`USD`/`TWD`/`JPY`) pass through unchanged.

## Dates

`A~B` → `request_time=A, obtained_at=B`; `A~` → `request_time=A, obtained_at=None`
(pending); `A` → `obtained_at=A` (request None); empty → both None. `/`→ISO.

## Open decisions (from the analysis; drive the parser)

- **M2** cost-factor keyword set (confirm 退稅/折價/運費 and any others).
- **M3** the "date OR location starts an acquisition; inherit source on date-only" rule.
- **M6** variant quantities (`深藍x2，灰色x1`, `48*2=2件`): aggregate to a count vs split
  into items. Default in the preview: **best-effort integer, else qty=1 + flag**.
- **M8** currency: keep `RMB` vs normalise to `CNY`.

## Promotion path

Once the dry-run output looks right, the parser is promoted to a Django management
command `inventory/management/commands/import_legacy_csv.py` that posts through
`AcquisitionSerializer` (respects validation, per-currency accumulated, Principle II)
with a `--dry-run` flag reusing this same parser.
