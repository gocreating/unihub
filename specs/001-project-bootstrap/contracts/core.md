# API Contract: Core (Shared Entity Infrastructure)

**Base prefix**: `/api/v1/core/`

---

## AttributeDefinition

### GET /api/v1/core/attribute-definitions/

List all AttributeDefinitions for a given entity type.

**Auth**: Session required

**Query params**:
- `content_type` (required): `app_label.model_name`, e.g., `finance.account`

**Response 200**:
```json
[
  {
    "id": 1,
    "name": "name",
    "data_type": "text",
    "is_system": true,
    "display_order": 0,
    "options": []
  }
]
```

---

### POST /api/v1/core/attribute-definitions/

Create a user-defined attribute for an entity type.

**Auth**: Session required

**Request body**:
```json
{
  "content_type": "finance.account",
  "name": "string",
  "data_type": "text | long_text | number | date | boolean | single_select",
  "display_order": 0,
  "options": []
}
```

**Response 201**: AttributeDefinition object

**Response 400**: `name` already exists for this content_type, or `is_system` conflict

---

### DELETE /api/v1/core/attribute-definitions/{id}/

Delete a user-defined attribute definition and all associated values.

**Auth**: Session required

**Response 200** (pre-delete confirmation info):
```json
{
  "affected_entity_count": 12,
  "attribute_name": "string"
}
```

**Notes**: Caller must confirm deletion by POSTing with `confirm: true`.
See DELETE with confirmation pattern below.

### DELETE /api/v1/core/attribute-definitions/{id}/?confirm=true

Permanently delete the definition and all AttributeValues linked to it.

**Response 204**: No content

**Response 400**: `is_system=True` definitions cannot be deleted

---

## AttributeValue

### GET /api/v1/core/attribute-values/

List all AttributeValues for a specific entity.

**Auth**: Session required

**Query params**:
- `content_type` (required): e.g., `finance.account`
- `object_id` (required): entity PK

**Response 200**:
```json
[
  {
    "id": 1,
    "attribute_definition_id": 5,
    "attribute_name": "string",
    "data_type": "text",
    "value": "string"
  }
]
```

---

### PUT /api/v1/core/attribute-values/

Upsert a set of AttributeValues for an entity (bulk replace).

**Auth**: Session required

**Request body**:
```json
{
  "content_type": "finance.account",
  "object_id": 42,
  "values": [
    { "attribute_definition_id": 5, "value": "string" }
  ]
}
```

**Response 200**: Updated list of AttributeValues for the entity
