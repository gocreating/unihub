/**
 * One rule for slotting columns a stored order does not mention (016 round 11).
 *
 * A saved view — or any captured configuration — lists the columns that existed
 * when it was written. Pages discover columns at runtime (the catalog's
 * `attr:<id>` parameter columns arrive with their definitions), so a stored
 * order is routinely a SUBSET of the declared one, and the missing columns have
 * to go somewhere.
 *
 * They go where the page declares them: immediately after the nearest declared
 * predecessor that the stored order does mention. Appending them at the tail
 * instead — the rule until round 11 — made two descriptions of the same table
 * compare unequal purely by WHEN each was captured: a config taken before the
 * parameter columns loaded put `actions` ahead of them, while the page declares
 * it last. Nothing could bring the two back together, so an untouched view
 * reported unsaved changes forever (R47).
 *
 * Both sides of every such comparison must use this function — the reconciled
 * baseline AND the live table state — or the mismatch simply moves.
 */
export function mergeMissingByDeclaredOrder(listedKeys: string[], declaredKeys: string[]): string[] {
  const declaredIndex = new Map(declaredKeys.map((key, i) => [key, i]));
  // Stored keys the page no longer declares are dropped by the caller's filter;
  // anything left keeps its stored relative order.
  const merged = [...listedKeys];
  const present = new Set(listedKeys);

  for (const key of declaredKeys) {
    if (present.has(key)) continue;
    const declaredAt = declaredIndex.get(key)!;
    // The last column already in place that the page declares BEFORE this one.
    let at = -1;
    for (let i = merged.length - 1; i >= 0; i--) {
      const other = declaredIndex.get(merged[i]!);
      if (other !== undefined && other < declaredAt) {
        at = i;
        break;
      }
    }
    merged.splice(at + 1, 0, key);
    // Later missing columns may anchor on this one, so consecutive newcomers
    // keep their declared order relative to each other.
    present.add(key);
  }
  return merged;
}
