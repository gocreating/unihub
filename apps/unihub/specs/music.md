# Music

A personal song collection — annotated, rated, and tagged.

## Entities

### Song
One record per song the user wants to keep in their collection.

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `artist` | string | |
| `album` | string | Optional |
| `year` | integer | Optional, e.g. 2003 |
| `genre` | string | Optional, e.g. "jazz", "city pop" |
| `language` | string | Optional, e.g. "Japanese", "English" |
| `rating` | integer | Optional, 1–5 |
| `notes` | text | Personal comments, mood associations, etc. |
| `tags` | string[] | e.g. `["road-trip", "focus", "90s"]` |

## URL Namespace
`/api/music/`

## Frontend Route
`/music`

## Future Scope (not now)
- MusicBrainz metadata lookup for autocomplete on add
- Playlist / collection groupings
- Linked streaming URL (Spotify, Apple Music)
