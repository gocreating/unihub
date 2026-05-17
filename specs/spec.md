# unihub — Project Specification

## Overview

**unihub** is a self-hosted personal life OS: a single dashboard that lets one user capture, organise, and browse every dimension of daily life from one place. Instead of maintaining a separate app for each concern (vocabulary trainer, contacts, music library, finance tracker, travel log), unihub brings all of them under a shared frontend shell backed by domain-specific Django apps in a single PostgreSQL database.

The defining feature is a **Notion-style entity system**: in every domain, the user creates entities whose columns (attributes) can be customised. The infrastructure for defining, storing, and querying dynamic attributes is shared across the whole project; each domain app builds its own UI or visualisation on top of it.

---

## Core Infrastructure: Dynamic Entity System

### Concept

Every domain stores its data as **Entities** with **Attribute Definitions** and **Attribute Values**. This is inspired by Notion's database view.

```
EntityType  (belongs to a domain)
  ├── AttributeDefinition  (column: name, data type, options)
  └── Entity               (a row)
         └── AttributeValue   (cell: entity × attribute_definition → value)
```

### Attribute Data Types

| Type | Storage | Example |
|------|---------|---------|
| `text` | `TextField` | Notes, descriptions |
| `number` | `DecimalField` | Rating, year, price |
| `boolean` | `BooleanField` | Read/watched, done |
| `date` | `DateField` | Release date, met-on |
| `select` | `CharField` + `options` JSON | Genre, status |
| `multi_select` | `JSONField` (list of strings) | Tags, categories |
| `url` | `URLField` | Link to streaming/source |

### Backend Models (shared `core` app)

```python
# core/models.py

class EntityType(models.Model):
    domain = models.CharField(max_length=100)   # e.g. "music", "people"
    name   = models.CharField(max_length=100)   # e.g. "Song", "Person"
    slug   = models.SlugField(unique=True)

class AttributeDefinition(models.Model):
    entity_type = models.ForeignKey(EntityType, on_delete=models.CASCADE)
    name        = models.CharField(max_length=100)
    slug        = models.SlugField()
    data_type   = models.CharField(max_length=20, choices=DATA_TYPE_CHOICES)
    options     = models.JSONField(default=list, blank=True)  # for select types
    required    = models.BooleanField(default=False)
    order       = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [('entity_type', 'slug')]
        ordering = ['order']

class Entity(models.Model):
    entity_type = models.ForeignKey(EntityType, on_delete=models.CASCADE)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

class AttributeValue(models.Model):
    entity               = models.ForeignKey(Entity, on_delete=models.CASCADE)
    attribute_definition = models.ForeignKey(AttributeDefinition, on_delete=models.CASCADE)
    value_text           = models.TextField(blank=True)
    value_number         = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    value_boolean        = models.BooleanField(null=True, blank=True)
    value_date           = models.DateField(null=True, blank=True)
    value_json           = models.JSONField(null=True, blank=True)  # multi_select, url

    class Meta:
        unique_together = [('entity', 'attribute_definition')]
```

### Shared DRF API

All entity management is served from a shared `/api/core/` namespace:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/core/entity-types/` | GET | List entity types |
| `/api/core/entity-types/{id}/attributes/` | GET, POST | List / create attribute definitions |
| `/api/core/entity-types/{id}/attributes/{id}/` | PATCH, DELETE | Update / remove attribute definition |
| `/api/core/entity-types/{id}/entities/` | GET, POST | List / create entities with their values |
| `/api/core/entity-types/{id}/entities/{id}/` | GET, PATCH, DELETE | Retrieve / update / delete entity |

### Frontend Shared Component: `EntityTable`

A single reusable `EntityTable` component wraps Ant Design `ProTable` and understands the dynamic-column API response. Domain pages pass their `entityTypeSlug` and optionally override column renderers for domain-specific visualisation.

```tsx
// shared usage in any domain page
<EntityTable
  entityTypeSlug="song"
  columnOverrides={{
    rating: (val) => <Rate value={val} disabled />,
  }}
/>
```

---

## Domain Apps

Each domain registers one or more `EntityType` seeds via a Django migration or management command. Domain apps can also define additional fixed models for relationships that don't fit the flat entity model (e.g. `Relationship` in `people`).

### Finance
Track accounts, transactions, and net worth over time.

**Entity types**: Account, Transaction

**Key attributes (Account)**: name, type (select: checking / savings / investment / crypto), currency, notes  
**Key attributes (Transaction)**: date, amount, description, category (select), account (FK)

### Visiting
Log places visited and plan future trips.

**Entity types**: Place, Visit

**Key attributes (Place)**: name, country, city, type (select: restaurant / museum / nature / city), rating, notes  
**Key attributes (Visit)**: place (FK), date, companions, notes

### Language
Word card decks and grammar cheat sheets for language study.

**Entity types**: Language, WordCard, GrammarSheet

**Key attributes (WordCard)**: language (FK), word, translation, romanization, example, tags  
**Key attributes (GrammarSheet)**: language (FK), title, content (markdown), tags

### People
Personal contact list and relationship network.

**Entity types**: Person  
**Fixed model**: `Relationship` (from_person, to_person, kind) — a directed graph edge, not a flat entity.

**Key attributes (Person)**: name, nickname, email, phone, tags, notes

### Music
Personal song collection with ratings and tags.

**Entity types**: Song

**Key attributes**: title, artist, album, year, genre, language, rating (1–5), tags, notes

---

## Technical Stack

### Backend (`apps/unihub/backend/`)

| Concern | Choice |
|---------|--------|
| Language | Python 3.12 |
| Framework | Django 5.x + Django REST Framework 3.x |
| Database | PostgreSQL 16 |
| OpenAPI | drf-spectacular → `/api/docs/` |
| Static files | WhiteNoise |
| HTTP client | httpx |
| Background tasks | django-q2 (when needed) |
| Auth | Django session auth |
| Package manager | uv |
| Linter | ruff |
| Tests | pytest-django |

Follows layout and conventions of `ov-fleet` backend:
- One `ModelViewSet` per entity type
- Separate read / write serializers
- `@extend_schema` decorators on all endpoints
- `PageNumberPagination` on list endpoints
- Domain apps are standalone Django apps (`finance`, `visiting`, `language`, `people`, `music`)
- Shared infrastructure lives in a `core` Django app

### Frontend (`apps/unihub/frontend/`)

| Concern | Choice |
|---------|--------|
| Language | TypeScript 5.x (strict) |
| Framework | React 18 + Vite |
| UI | Ant Design 5 + @ant-design/pro-components |
| Data fetching | TanStack React Query 5 |
| Routing | React Router 7 |
| Package manager | pnpm |
| Linter | ESLint |
| Tests | Vitest + React Testing Library |
| API types | openapi-typescript (generated from `openapi.yaml`) |

**Note**: unihub uses Vite + React Router rather than UmiJS (ov-fleet's choice). The UI component library and data-fetching layer are identical.

Service layer lives at `src/services/unihub-backend/`:
- One file per domain (`finance.ts`, `language.ts`, `people.ts`, `music.ts`)
- Types auto-generated from OpenAPI schema — never hand-written
- TanStack Query key convention: `['domain', 'resource', ...params]`

---

## Functional Requirements

### FR-1: Entity Type Management
- **FR-1.1** The system shall provide at least one `EntityType` per domain, seeded on first deploy.
- **FR-1.2** The user shall be able to add a new `AttributeDefinition` to any `EntityType` (name, type, options).
- **FR-1.3** The user shall be able to reorder `AttributeDefinition` records via the `order` field.
- **FR-1.4** The user shall be able to delete an `AttributeDefinition`; all associated `AttributeValue` rows shall be cascade-deleted.
- **FR-1.5** Each `AttributeDefinition` shall enforce its `data_type` when values are submitted.

### FR-2: Entity CRUD
- **FR-2.1** The user shall be able to create an `Entity` with values for any subset of defined attributes.
- **FR-2.2** The user shall be able to update any `AttributeValue` on an existing entity.
- **FR-2.3** The user shall be able to delete an entity; all `AttributeValue` rows shall be cascade-deleted.
- **FR-2.4** The list endpoint shall return entities paginated (default page size: 20).
- **FR-2.5** The list endpoint shall support filtering by any attribute value via query params.
- **FR-2.6** The list endpoint shall support full-text search across text-type attribute values.

### FR-3: Shared EntityTable Component
- **FR-3.1** `EntityTable` shall fetch column definitions and rows from the core API using the provided `entityTypeSlug`.
- **FR-3.2** `EntityTable` shall render one ProTable column per `AttributeDefinition`, in `order` sequence.
- **FR-3.3** Domain pages shall be able to override the cell renderer for any column via `columnOverrides`.
- **FR-3.4** `EntityTable` shall support inline cell editing for text and number types.
- **FR-3.5** `EntityTable` shall include an "Add row" action that opens a drawer form pre-populated with all attribute definitions.

### FR-4: Navigation & Shell
- **FR-4.1** The sidebar shall list all active domains; clicking navigates to that domain's page.
- **FR-4.2** Each domain page shall mount the `EntityTable` for its primary entity type by default.
- **FR-4.3** Domains with multiple entity types (e.g. Finance: Account + Transaction) shall show sub-navigation tabs.

### FR-5: Authentication
- **FR-5.1** All API endpoints except `/api/health/` shall require session authentication.
- **FR-5.2** The user shall be able to log in via Django's session auth (username + password).
- **FR-5.3** A login page shall be shown when the frontend detects a 401 response.

### FR-6: Deployment
- **FR-6.1** The full stack shall be runnable with a single `docker compose up` command from the repo root.
- **FR-6.2** The backend shall run database migrations automatically on container start via `entrypoint.sh`.
- **FR-6.3** The production compose file shall accept all secrets via environment variables (no hardcoded credentials).

---

## User Scenarios

### Scenario A: Adding a Song to the Collection
1. User navigates to `/music` in the sidebar.
2. The EntityTable loads, showing columns: Title, Artist, Album, Year, Genre, Rating, Tags.
3. User clicks "Add row"; a drawer form opens with fields for all attributes.
4. User fills in title, artist, and rating; leaves other fields blank.
5. On submit, a POST to `/api/core/entity-types/song/entities/` creates the entity and attribute values.
6. The new row appears in the table without a full page reload.

### Scenario B: Adding a Custom Attribute to People
1. User is on the `/people` page and wants to track "birthday" for each person.
2. User clicks "Manage columns" → "Add column".
3. User sets name = "Birthday", type = "date", required = false.
4. A PATCH to `/api/core/entity-types/person/attributes/` adds the `AttributeDefinition`.
5. The EntityTable re-fetches column definitions; a "Birthday" column appears (empty for existing rows).
6. User clicks a cell in the Birthday column to add a date inline.

### Scenario C: Filtering Word Cards by Language
1. User navigates to `/language`.
2. EntityTable shows all WordCards across all languages.
3. User selects "Japanese" in the Language filter dropdown.
4. The list re-fetches with `?language=ja` in the query string.
5. Only Japanese word cards are shown.

### Scenario D: First Deploy
1. Operator copies `.env.example` to `apps/unihub/.env` and fills in secrets.
2. Operator runs `docker compose -f apps/unihub/docker-compose.production.yml up -d`.
3. Backend container starts, `entrypoint.sh` runs `manage.py migrate` then `gunicorn`.
4. Migrations create all tables including core entity-system tables and domain seed data.
5. Frontend container serves the built SPA via nginx.
6. Operator visits the frontend URL, is redirected to `/login`, creates superuser via `manage.py createsuperuser`, and logs in.

---

## Success Criteria

| ID | Criterion | How to verify |
|----|-----------|---------------|
| SC-1 | Stack builds and all containers start healthy | `docker compose up -d` → all containers `Up (healthy)` |
| SC-2 | Backend health check passes | `GET /api/health/` → `{"status": "ok"}` |
| SC-3 | OpenAPI schema is generated | `GET /api/docs/` renders Swagger UI with all endpoints |
| SC-4 | Entity CRUD works end-to-end for one domain (Music) | Create, read, update, delete a Song via API; verify in DB |
| SC-5 | Dynamic attribute can be added at runtime | Add a new `AttributeDefinition` via API; confirm new column appears in EntityTable |
| SC-6 | Frontend renders EntityTable for Music | Navigate to `/music`; table shows correct columns and data |
| SC-7 | Inline cell edit saves to backend | Edit a Song's rating in the table; refresh; value persists |
| SC-8 | Unauthenticated requests are rejected | `GET /api/core/entity-types/` without session cookie → 403 |
| SC-9 | Login flow works | Visit frontend unauthenticated → redirected to `/login` → login succeeds → redirected back |
| SC-10 | TypeScript strict check passes | `pnpm typecheck` exits 0 |
| SC-11 | Backend linter passes | `uv run ruff check .` exits 0 |

---

## Out of Scope (v1)

- Spaced-repetition scheduling for Language word cards
- Graph visualisation for People relationships
- Music metadata autocomplete via MusicBrainz API
- Multi-user support or sharing
- Mobile / responsive layout
- Import / export (CSV, Anki, etc.)
- Offline support
