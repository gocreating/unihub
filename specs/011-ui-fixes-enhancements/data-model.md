# Data Model: UI Fixes and Enhancements

No new data entities. No changes to existing backend models, serializers, or migrations.

## Frontend State (non-persisted)

One new piece of local component state is introduced:

| Component | State Variable | Type | Purpose |
|-----------|---------------|------|---------|
| `AppShell` | `siderCollapsed` | `boolean` | Tracks sidebar open/closed to apply scroll lock |

This state is not persisted to localStorage or any remote storage. It resets to `true` (collapsed) on every page load, matching ProLayout's default.

## No API Changes

No OpenAPI schema regeneration is required. All frontend types remain as-is.
