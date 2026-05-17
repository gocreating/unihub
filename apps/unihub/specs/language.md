# Language Learning

Personal reference library for languages the user is studying.

## Entities

### Language
The root entity. One record per language being tracked.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display name, e.g. "Japanese" |
| `code` | string | ISO 639-1, e.g. "ja" — unique |
| `notes` | text | Free-form study notes |

### WordCard
A vocabulary flashcard. Designed to be searched and filtered, not to enforce SRS scheduling (keep that scope out for now).

| Field | Type | Notes |
|---|---|---|
| `language` | FK → Language | |
| `word` | string | The word in the target language |
| `translation` | string | Primary translation |
| `romanization` | string | Optional — romaji, pinyin, transliteration |
| `example` | text | Example sentence(s) |
| `notes` | text | Personal mnemonics or context |
| `tags` | string[] | e.g. `["n5", "verb", "daily"]` |

### GrammarSheet
A free-form Markdown document covering a grammar point or pattern.

| Field | Type | Notes |
|---|---|---|
| `language` | FK → Language | |
| `title` | string | e.g. "て-form conjugation" |
| `content` | text (Markdown) | Full explanation with examples |
| `tags` | string[] | e.g. `["verb", "conjugation"]` |

## URL Namespace
`/api/language/`

## Frontend Route
`/language`

## Future Scope (not now)
- Spaced-repetition scheduling (`next_review_at`, review history)
- Import/export from Anki decks
