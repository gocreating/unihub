// US4 (015 FR-010): row-level staging on preview tables — every row checked by
// default, toggleable per row and per tab, reported through the selection prop.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ChangePreviewTable } from './ChangePreviewTable';
import type { PreviewSelection } from './ChangePreviewTable';
import type { ChangeRecord } from '@/services/unihub-backend/io';

function makeCreates(n: number): ChangeRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    pk: `pk-${i}`,
    operation: 'create' as const,
    before: null,
    after: { 'id:string': `pk-${i}`, 'name:string': `row-${i}` },
    changed_fields: [],
  }));
}

function renderWithSelection(creates: ChangeRecord[], selection: PreviewSelection) {
  return render(
    <IntlProvider locale="en-US" messages={enUS}>
      <ChangePreviewTable
        creates={creates}
        updates={[]}
        deletes={[]}
        errors={[]}
        selection={selection}
      />
    </IntlProvider>,
  );
}

describe('ChangePreviewTable staging (015 US4)', () => {
  it('renders all rows checked by default (no exclusions)', () => {
    const { container } = renderWithSelection(makeCreates(3), {
      excludedPks: new Set(),
      onToggle: vi.fn(),
    });
    const rowChecks = container.querySelectorAll('.ant-table-tbody tr[data-row-key] .ant-checkbox-input');
    expect(rowChecks).toHaveLength(3);
    rowChecks.forEach((c) => expect((c as HTMLInputElement).checked).toBe(true));
  });

  it('renders excluded rows unchecked', () => {
    const { container } = renderWithSelection(makeCreates(3), {
      excludedPks: new Set(['pk-1']),
      onToggle: vi.fn(),
    });
    const rowChecks = Array.from(
      container.querySelectorAll('.ant-table-tbody tr[data-row-key] .ant-checkbox-input'),
    ) as HTMLInputElement[];
    expect(rowChecks.map((c) => c.checked)).toEqual([true, false, true]);
  });

  it('reports single-row toggles through onToggle', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = renderWithSelection(makeCreates(3), {
      excludedPks: new Set(),
      onToggle,
    });
    const rowChecks = container.querySelectorAll('.ant-table-tbody tr[data-row-key] .ant-checkbox-input');
    await user.click(rowChecks[1]!);
    expect(onToggle).toHaveBeenCalledWith(['pk-1'], false);
  });

  it('reports tab-level select-all toggles through onToggle', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = renderWithSelection(makeCreates(3), {
      excludedPks: new Set(['pk-0', 'pk-1', 'pk-2']),
      onToggle,
    });
    const headerCheck = container.querySelector('.ant-table-thead .ant-checkbox-input');
    expect(headerCheck).toBeTruthy();
    await user.click(headerCheck!);
    expect(onToggle).toHaveBeenCalledTimes(1);
    const [pks, staged] = onToggle.mock.calls[0]!;
    expect([...pks].sort()).toEqual(['pk-0', 'pk-1', 'pk-2']);
    expect(staged).toBe(true);
  });

  it('renders no checkboxes without a selection prop', () => {
    const { container } = render(
      <IntlProvider locale="en-US" messages={enUS}>
        <ChangePreviewTable creates={makeCreates(2)} updates={[]} deletes={[]} errors={[]} />
      </IntlProvider>,
    );
    expect(container.querySelector('.ant-checkbox-input')).toBeNull();
  });
});
