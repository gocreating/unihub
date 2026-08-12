import { render, screen } from '@testing-library/react';
import { SearchHighlightProvider, SearchMark } from './SearchMark';

describe('SearchMark (019 quick search)', () => {
  it('renders plain text when no provider is present', () => {
    const { container } = render(<SearchMark text="Taiwan Dollar" />);
    expect(container.textContent).toBe('Taiwan Dollar');
    expect(container.querySelector('mark')).toBeNull();
  });

  it('renders plain text when the context query is empty', () => {
    const { container } = render(
      <SearchHighlightProvider value="">
        <SearchMark text="Taiwan Dollar" />
      </SearchHighlightProvider>,
    );
    expect(container.querySelector('mark')).toBeNull();
  });

  it('marks every case-insensitive occurrence of the context query', () => {
    const { container } = render(
      <SearchHighlightProvider value="dollar">
        <SearchMark text="Dollar to dollar" />
      </SearchHighlightProvider>,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('Dollar');
    expect(marks[1]!.textContent).toBe('dollar');
  });

  it('stringifies non-string values and marks matches inside them', () => {
    const { container } = render(
      <SearchHighlightProvider value="31.05">
        <SearchMark text={31.05} />
      </SearchHighlightProvider>,
    );
    expect(container.querySelector('mark')?.textContent).toBe('31.05');
  });

  it('renders nothing for null/undefined text', () => {
    const { container } = render(
      <SearchHighlightProvider value="x">
        <SearchMark text={null} />
      </SearchHighlightProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it('the nearest provider wins', () => {
    render(
      <SearchHighlightProvider value="outer">
        <SearchHighlightProvider value="inner">
          <SearchMark text="inner and outer" />
        </SearchHighlightProvider>
      </SearchHighlightProvider>,
    );
    expect(screen.getByText('inner', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.queryByText('outer', { selector: 'mark' })).toBeNull();
  });
});
