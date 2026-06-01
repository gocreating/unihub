# Research: Fix Finance Data Sync

**Phase**: 0 | **Date**: 2026-06-01 | **Feature**: 009-fix-finance-sync

## Decision 1: Auto-Discovery via `model._meta.concrete_fields`

**Decision**: Implement a utility function `auto_system_fields(model_class, ...)` in `data_io/registry.py` that reads `model._meta.concrete_fields` to generate `FieldDescriptor` objects automatically.

**Rationale**: `concrete_fields` returns exactly the fields that correspond to DB columns — it excludes `ManyToManyField`, reverse relations, and virtual fields. This is the canonical Django API for "fields that exist in this table." Any new column added to a model automatically appears in `concrete_fields` on the next Django startup, satisfying FR-002.

**Alternatives considered**:
- `model._meta.fields` — same as `concrete_fields` for most cases; `concrete_fields` is more explicit and documented.
- `model._meta.get_fields()` — includes reverse FK relations, M2M, and virtual fields; requires more filtering.
- Validation-only approach (test that catches omissions) — does not satisfy FR-002 ("automatic inclusion without manual change"); rejected.

---

## Decision 2: FK Field Handling — Explicit Override Required

**Decision**: `auto_system_fields()` auto-detects `ForeignKey` fields (via `field.is_relation`) and sets `is_fk=True` and `data_type="string"` automatically. However, `fk_content_type_label` (the label of the referenced table) cannot be inferred from the model and MUST be provided by the caller via an `fk_overrides` parameter.

**Rationale**: Django FK fields do not store the content_type_label of the referenced model; that is a data_io-specific concept. The registered label (`"finance.account"`) is the data_io key — it cannot be derived from the Django FK target without a lookup that may not be reliable at startup. Requiring an explicit override for FK fields is a one-time manual step that is clearly documented and cannot be forgotten (a test will catch missing `fk_content_type_label` on FK fields).

**FK field column naming**: Django stores FKs as `<field_name>_id` columns (e.g., `account_id`). `field.attname` returns this correct column name. `auto_system_fields` uses `attname` for FK fields.

**Alternatives considered**:
- Inferring `fk_content_type_label` from `field.related_model._meta.app_label + '.' + field.related_model._meta.model_name` — works but ties the data_io label format to Django's app/model naming; rejected because the label should be an explicit contract.

---

## Decision 3: Timestamp Field Strategy (auto_now / auto_now_add)

**Decision**: Include `created_at` (auto_now_add) and `updated_at` (auto_now) in the sync export. On import, preserve the original values via `queryset.update()` after the initial `save()` (which sets auto_now fields to the current time). The two-step approach: `save()` creates the record, then `update(created_at=..., updated_at=...)` overwrites with the original values.

**Rationale**: True backup fidelity requires preserving original timestamps. The two-step approach is safe for both `auto_now_add` and `auto_now` fields and is already used in Django's `dumpdata`/`loaddata` management commands for fixture loading. It does not require patching the model class.

**Alternatives considered**:
- Exclude `created_at`/`updated_at` from sync — simple but incomplete; violates FR-001 (all persisted attributes must be synced).
- Temporarily set `field.auto_now = False` during import — mutates class state; not thread-safe; rejected.
- Use `Model.objects.bulk_create(..., update_conflicts=True)` — complex conflict handling; the two-step approach is simpler and already proven.

**Field type mapping** (auto_now fields are `DateTimeField`):
- `auto_now_add=True` → `data_type="datetime"`, `nullable=False`
- `auto_now=True` → `data_type="datetime"`, `nullable=False`

---

## Decision 4: Field Type Mapping (Django → data_io data_type)

**Decision**: Map Django field classes to data_io `data_type` strings as follows:

| Django Field Class | data_type |
|---|---|
| `BooleanField`, `NullBooleanField` | `"boolean"` |
| `DateTimeField`, `DateField` | `"datetime"` |
| `DecimalField` | `"decimal"` |
| `FloatField` | `"float"` |
| `IntegerField`, `AutoField`, `BigAutoField`, `SmallIntegerField`, `PositiveIntegerField` | `"integer"` |
| `JSONField` | `"json"` — requires `is_json=True` in `FieldDescriptor` |
| `ForeignKey`, `OneToOneField` | `"string"` (FK value is a string PK) |
| `CharField`, `TextField`, `SlugField`, `EmailField` (and default) | `"text"` or `"string"` based on `max_length` |

**`text` vs `string` distinction** (existing convention): `max_length <= 50` → `"string"` (short identifier), `max_length > 50` → `"text"` (free-form). PK fields are always `"string"`.

**Rationale**: Matches the existing `csv_header` patterns used in `finance/apps.py`.

---

## Decision 5: Backward Compatibility — Missing Column Handling

**Decision**: The existing `csv_importer.py` already handles missing columns gracefully (it reads headers from the CSV and only processes known columns). No change is required for forward-compatibility (new CSVs with new columns imported into old code). For backward-compatibility (old CSVs missing new columns), the importer MUST use the `FieldDescriptor.nullable` flag or a new `default` attribute to apply safe defaults when a column is absent.

**Rationale**: The existing importer is lenient on extra columns. The only new work needed is ensuring that `nullable=True` (or a `default` value) is set appropriately on newly discovered fields so that old CSVs don't fail when imported. `auto_system_fields()` will set `nullable=True` for any field with `blank=True` or `null=True`.

**Alternatives considered**:
- Fail fast if any registered column is missing — breaks backward compatibility with all pre-fix remote exports; rejected per FR-006.

---

## Confirmed Missing Fields (Minimum Fix Scope)

Per spec FR-009 and FR-010, these fields are confirmed missing and are the minimum fix:

| Model | Missing Field | Django Type | data_type | Default on old import |
|---|---|---|---|---|
| Currency | `is_base_currency` | BooleanField | `"boolean"` | `False` |
| Account | `color` | CharField(max_length=25) | `"string"` | `""` |
| Account | `created_at` | DateTimeField(auto_now_add) | `"datetime"` | import timestamp |
| Account | `updated_at` | DateTimeField(auto_now) | `"datetime"` | import timestamp |
| BalanceSheet | `created_at` | DateTimeField(auto_now_add) | `"datetime"` | import timestamp |
| BalanceSheet | `updated_at` | DateTimeField(auto_now) | `"datetime"` | import timestamp |

ExchangeRate and Balance models have no missing fields (no timestamp fields; all model fields are already registered).
