// US2 (015 FR-005): change-preview tables follow the constitution footer —
// non-interactive info ("N records") on the LEFT; ALL interactive controls on
// the RIGHT, per-page size selector FIRST, then the pagination.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ChangePreviewTable } from './ChangePreviewTable';
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

function renderTable(creates: ChangeRecord[]) {
  return render(
    <IntlProvider locale="en-US" messages={enUS}>
      <ChangePreviewTable creates={creates} updates={[]} deletes={[]} errors={[]} />
    </IntlProvider>,
  );
}

describe('ChangePreviewTable pagination footer (015 US2)', () => {
  it('renders the record count on the left and size selector BEFORE pagination', () => {
    const { container } = renderTable(makeCreates(12));

    // The standard footer info text (ICU plural).
    const info = screen.getByText('12 records');
    expect(info).toBeTruthy();

    // The size selector must precede the pagination in DOM order.
    const select = container.querySelector('.ant-select');
    const pagination = container.querySelector('.ant-pagination');
    expect(select).toBeTruthy();
    expect(pagination).toBeTruthy();
    const position = select!.compareDocumentPosition(pagination!);
    // DOCUMENT_POSITION_FOLLOWING (4): pagination comes after the selector.
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);

    // antd's built-in table pagination (which puts the size changer on the
    // wrong side) must not render.
    expect(container.querySelector('.ant-table-pagination')).toBeNull();

    // Info left, controls right: they live in the same flex row, info first.
    const footerRow = info.closest('.ant-flex');
    expect(footerRow).toBeTruthy();
    expect(footerRow!.contains(select!)).toBe(true);
    expect(footerRow!.contains(pagination!)).toBe(true);
    const infoPos = info.compareDocumentPosition(select!);
    expect(infoPos & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);
  });

  it('paginates client-side: page 1 shows pageSize rows, page 2 the rest', async () => {
    const user = userEvent.setup();
    const { container } = renderTable(makeCreates(12));

    expect(container.querySelectorAll('.ant-table-tbody tr[data-row-key]')).toHaveLength(10);

    await user.click(screen.getByRole('listitem', { name: '2' }));
    expect(container.querySelectorAll('.ant-table-tbody tr[data-row-key]')).toHaveLength(2);
  });

  it('changing the page size reslices the rows', async () => {
    const user = userEvent.setup();
    const { container } = renderTable(makeCreates(12));

    await user.click(container.querySelector('.ant-select-selector')!);
    await user.click(await screen.findByTitle('25 / page'));

    expect(container.querySelectorAll('.ant-table-tbody tr[data-row-key]')).toHaveLength(12);
  });

  it('uses the singular form for one record', () => {
    renderTable(makeCreates(1));
    expect(screen.getByText('1 record')).toBeTruthy();
  });
});
