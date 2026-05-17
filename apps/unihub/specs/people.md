# People

A personal contact list and relationship network.

## Entities

### Person
One record per person the user wants to track.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Full name |
| `nickname` | string | Optional short name |
| `email` | email | Optional |
| `phone` | string | Optional |
| `notes` | text | Personal observations, shared history, etc. |
| `tags` | string[] | e.g. `["tokyo", "tech", "climbing"]` |

### Relationship
A directed edge between two people. Keeps the data model simple — direction from user's perspective (e.g. "Alice is my colleague" = `from=me, to=Alice, kind=colleague`).

| Field | Type | Notes |
|---|---|---|
| `from_person` | FK → Person | |
| `to_person` | FK → Person | |
| `kind` | string | e.g. "friend", "colleague", "family", "mentor" |
| `notes` | text | Optional context |
| Unique on | `(from_person, to_person, kind)` | Prevents duplicate edges |

## URL Namespace
`/api/people/`

## Frontend Route
`/people`

## Future Scope (not now)
- Graph visualisation of the relationship network
- Interaction log (meetings, calls) per person
- Birthday / date reminders
