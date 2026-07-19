import type { AttributeDefinition } from '@/services/unihub-backend/core';
import type { ItemParameterWrite } from '@/services/unihub-backend/inventory';
import type { ParameterDisplay } from '@/components/ItemDisplay';

// Value-only badge composition retired in iteration 26 (FR-031): mixed lists
// render localized key-value pairs via components/ItemDisplay instead.

/** Resolve pending ItemWrite parameter rows against the definitions list. */
export function draftParameters(
  rows: ItemParameterWrite[] | undefined,
  definitions: AttributeDefinition[] | undefined,
): ParameterDisplay[] {
  const byId = new Map((definitions ?? []).map((definition) => [definition.id, definition]));
  const resolved: ParameterDisplay[] = [];
  for (const row of rows ?? []) {
    const definition = byId.get(row.definition_id);
    if (!definition) continue;
    resolved.push({
      name: definition.name,
      data_type: definition.data_type,
      value: row.value,
      unit: row.unit ?? '',
      emoji: definition.emoji ?? '',
    });
  }
  return resolved;
}
