# Data Model: Data Sync Migration Fix & Publish Preview

## No New Django Models

This feature introduces no new database models or migrations. All changes are either:
- Adding `apps.py` registry registrations for existing models
- New in-memory service logic (publish preview diff computation)
- New API endpoints and frontend components

---

## Existing Models Being Registered

These models already exist and have migrations. This feature registers them into the `data_io` registry for the first time, making them visible to sync, export, and import operations.

### `language.Language`

| Field | Django type | CSV header | Notes |
|---|---|---|---|
| `id` | AutoField (PK) | `id:integer` | is_pk=True |
| `name` | CharField(100) | `name:text` | Language display name, e.g. "Japanese" |
| `code` | CharField(10) | `code:string` | ISO 639-1 code, unique constraint, e.g. "ja" |
| `notes` | TextField | `notes:text` | Optional free-form notes |
| `created_at` | auto_now_add | — | Excluded from CSV (auto-managed) |

Import order: **10**. No FK dependencies.

### `language.WordCard`

| Field | Django type | CSV header | Notes |
|---|---|---|---|
| `id` | AutoField (PK) | `id:integer` | is_pk=True |
| `language_id` | ForeignKey(Language) | `language_id:integer` | is_fk=True, fk_content_type_label="language.language" |
| `word` | CharField(255) | `word:text` | |
| `translation` | CharField(255) | `translation:text` | |
| `romanization` | CharField(255) | `romanization:text` | Romaji/pinyin etc., blank=True |
| `example` | TextField | `example:text` | blank=True |
| `notes` | TextField | `notes:text` | blank=True |
| `tags` | JSONField(list) | `tags:json` | is_json=True; serialized via json.dumps |
| `created_at` | auto_now_add | — | Excluded |
| `updated_at` | auto_now | — | Excluded |

Import order: **11**. Depends on `language.language`.

### `language.GrammarSheet`

| Field | Django type | CSV header | Notes |
|---|---|---|---|
| `id` | AutoField (PK) | `id:integer` | is_pk=True |
| `language_id` | ForeignKey(Language) | `language_id:integer` | is_fk=True, fk_content_type_label="language.language" |
| `title` | CharField(255) | `title:text` | |
| `content` | TextField | `content:text` | Markdown content |
| `tags` | JSONField(list) | `tags:json` | is_json=True |
| `created_at` | auto_now_add | — | Excluded |
| `updated_at` | auto_now | — | Excluded |

Import order: **12**. Depends on `language.language`.

### `music.Song`

| Field | Django type | CSV header | Notes |
|---|---|---|---|
| `id` | AutoField (PK) | `id:integer` | is_pk=True |
| `title` | CharField(255) | `title:text` | |
| `artist` | CharField(255) | `artist:text` | |
| `album` | CharField(255) | `album:text` | blank=True |
| `year` | PositiveSmallIntegerField | `year:integer` | null=True, nullable=True |
| `genre` | CharField(100) | `genre:string` | blank=True |
| `language` | CharField(100) | `language:string` | Display language name, blank=True |
| `rating` | PositiveSmallIntegerField | `rating:integer` | 1–5, null=True, nullable=True |
| `notes` | TextField | `notes:text` | blank=True |
| `tags` | JSONField(list) | `tags:json` | is_json=True |
| `created_at` | auto_now_add | — | Excluded |
| `updated_at` | auto_now | — | Excluded |

Import order: **20**. No FK dependencies.

### `people.Person`

| Field | Django type | CSV header | Notes |
|---|---|---|---|
| `id` | AutoField (PK) | `id:integer` | is_pk=True |
| `name` | CharField(255) | `name:text` | |
| `nickname` | CharField(255) | `nickname:text` | blank=True |
| `email` | EmailField | `email:string` | blank=True |
| `phone` | CharField(50) | `phone:string` | blank=True |
| `notes` | TextField | `notes:text` | blank=True |
| `tags` | JSONField(list) | `tags:json` | is_json=True |
| `created_at` | auto_now_add | — | Excluded |
| `updated_at` | auto_now | — | Excluded |

Import order: **30**. No FK dependencies.

### `people.Relationship`

| Field | Django type | CSV header | Notes |
|---|---|---|---|
| `id` | AutoField (PK) | `id:integer` | is_pk=True |
| `from_person_id` | ForeignKey(Person) | `from_person_id:integer` | is_fk=True, fk_content_type_label="people.person" |
| `to_person_id` | ForeignKey(Person) | `to_person_id:integer` | is_fk=True, fk_content_type_label="people.person" |
| `kind` | CharField(100) | `kind:string` | e.g. "friend", "colleague" |
| `notes` | TextField | `notes:text` | blank=True |
| `created_at` | auto_now_add | — | Excluded |

Import order: **31**. Depends on `people.person` (twice — both FK columns point to same table).

`unique_together = [("from_person", "to_person", "kind")]` — handled by the truncate-then-reimport strategy in `import_from_clone()`.

---

## New In-Memory Type: `SyncPublishPreviewResult`

Not a database model — a service-layer return type and API response shape.

```
SyncPublishPreviewResult:
  status: "up_to_date" | "has_changes" | "no_prior_publish"
  changes: list[SyncPublishPreviewChange]   # empty when status="up_to_date"

SyncPublishPreviewChange:
  table: str           # content_type_label, e.g. "finance.account"
  display_name: str    # human-readable, e.g. "Accounts"
  added: int           # records in local DB not present in HEAD commit
  modified: int        # records in both with at least one field changed
  deleted: int         # records in HEAD commit no longer in local DB
```

The `changes` list includes only tables with at least one change (`added + modified + deleted > 0`). Tables with no changes are omitted. When `status = "no_prior_publish"`, all local records are reported as `added` and `modified` + `deleted` are 0 for every table.
