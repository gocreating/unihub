/**
 * Quick search (019) highlight seam.
 *
 * `SearchHighlightProvider` carries the active (debounced) query; `SearchMark`
 * is the leaf that marks matches inside a cell's text. Because the query flows
 * through CONTEXT, the pages' memoized column definitions need no new
 * dependency — a query change re-renders the leaves, not the columns (R9).
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { HighlightText } from './index';

const SearchHighlightContext = createContext<string>('');

export function SearchHighlightProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <SearchHighlightContext.Provider value={value}>{children}</SearchHighlightContext.Provider>
  );
}

/** Render `text` with the context query's matches wrapped in `<mark>`.
 *  Accepts any cell-ish value; null/undefined render as nothing. */
export function SearchMark({ text }: { text: string | number | null | undefined }) {
  const query = useContext(SearchHighlightContext);
  const value = text == null ? '' : String(text);
  if (!query || !value) return <>{value}</>;
  return <HighlightText text={value} query={query} />;
}
