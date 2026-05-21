# Research: Legacy Finance Data Migration

## ID Format

**Decision**: Keep legacy 8-character NanoID references unchanged as output `id` values.

**Rationale**: The unihub import format declares `id:string` with no length constraint. Preserving legacy references avoids generating new IDs, eliminates any risk of FK mapping errors, and keeps the output auditable against the source.

**Alternatives considered**: Generating new 12-character NanoIDs — rejected because it adds complexity with zero benefit for a one-off migration.

---

## Decimal Precision for Exchange Rates

**Decision**: Round legacy float values to 6 decimal places using Python's `Decimal` type with `ROUND_HALF_UP`.

**Rationale**: The legacy `finance_price.value` field stores IEEE 754 double-precision floats (e.g., `32.32279968261719`). The new `rate:decimal` field expects exact decimal values. Six decimal places captures all meaningful precision in the data (USD/TWD rates never need more than 4–5 significant decimal digits) while eliminating float representation noise. SC-004 requires the result to differ from the source by no more than 0.000001, which 6-place rounding satisfies.

**Alternatives considered**: 4 decimal places — rejected as too lossy for some rate values. Unlimited precision — rejected as it propagates float noise into the output.

---

## Datetime Format

**Decision**: Pass legacy ISO 8601 timestamps through unchanged (e.g., `2024-05-01T00:00:00Z`).

**Rationale**: The unihub import format uses `datetime` type annotations. The legacy system already stores datetimes in ISO 8601 / UTC format, which is the standard datetime representation. No conversion is needed.

**Alternatives considered**: Stripping the trailing `Z` — rejected; unnecessary and risks ambiguity.

---

## Null / Empty Values

**Decision**: Output empty string (`""`) for absent values (e.g., `close_datetime` for open accounts).

**Rationale**: CSV has no native null type. Empty string is the universal convention and is what the unihub export produces for absent fields (verified in template). The Python `csv` module writes empty string for `None` values automatically.

---

## Output Directory

**Decision**: Write output to `data_migration/unihub-ready/` (fixed name, recreated on each run).

**Rationale**: A fixed output directory name makes the script idempotent (safe to re-run) and gives a stable path for the user to reference in the Import flow. The legacy data is dated so re-running produces the same result.

**Alternatives considered**: Timestamped output directory — rejected; the import flow needs a predictable path and the script is deterministic.

---

## Script Dependencies

**Decision**: Use Python 3 stdlib only (`csv`, `pathlib`, `decimal`, `sys`). No external packages.

**Rationale**: The migration script is a one-off tool. Avoiding external dependencies eliminates setup friction and environment concerns. All required operations (CSV parsing, decimal arithmetic, path manipulation) are available in the standard library.

---

## Symbol Field in finance_currency.csv

**Decision**: Use the legacy asset `symbol` field (e.g., `TWD`, `USD`) for both the `code` and `symbol` columns in the output.

**Rationale**: The legacy data does not store a display symbol (e.g., `NT$`, `$`). The unihub template's `symbol:text` field is assumed to accept the ISO currency code as its value. This is documented as an assumption in the spec and can be corrected manually after import if needed.
