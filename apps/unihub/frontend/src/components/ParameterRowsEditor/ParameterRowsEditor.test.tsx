import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ParameterRowsEditor } from './index';
import * as coreService from '@/services/unihub-backend/core';
import type { AttributeDefinition } from '@/services/unihub-backend/core';
import type { ItemParameterWrite } from '@/services/unihub-backend/inventory';

vi.mock('@/services/unihub-backend/core');

const DEFS = [
  { id: 'd-color', content_type: 7, content_type_label: 'inventory.item', name: 'color', data_type: 'text', unit_family: '', is_system: true, display_order: 0, options: [] },
  { id: 'd-weight', content_type: 7, content_type_label: 'inventory.item', name: 'weight', data_type: 'dimension', unit_family: 'weight', is_system: true, display_order: 2, options: [] },
  { id: 'd-capacity', content_type: 7, content_type_label: 'inventory.item', name: 'capacity', data_type: 'number', unit_family: '', is_system: false, display_order: 10, options: [] },
  { id: 'd-batt', content_type: 7, content_type_label: 'inventory.item', name: 'batt', data_type: 'dimension', unit_family: 'battery', is_system: false, display_order: 11, options: [] },
] as AttributeDefinition[];

function Harness({
  initial,
  onChange,
}: {
  initial: ItemParameterWrite[];
  onChange?: (rows: ItemParameterWrite[]) => void;
}) {
  const [rows, setRows] = useState(initial);
  return (
    <ParameterRowsEditor
      value={rows}
      onChange={(next) => {
        setRows(next);
        onChange?.(next);
      }}
    />
  );
}

function renderEditor(initial: ItemParameterWrite[], onChange?: (rows: ItemParameterWrite[]) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <Harness initial={initial} onChange={onChange} />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

const lastDropdown = () => {
  const dropdowns = document.querySelectorAll('.ant-select-dropdown');
  return dropdowns[dropdowns.length - 1] as HTMLElement;
};

describe('ParameterRowsEditor', () => {
  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
  });

  // PRE-01: existing rows render typed inputs; dimension rows show a unit select.
  it('renders existing rows with typed inputs and unit select for dimension keys', async () => {
    renderEditor([
      { definition_id: 'd-color', value: 'red' },
      { definition_id: 'd-weight', value: '1.5', unit: 'kg' },
    ]);
    expect(await screen.findByDisplayValue('red')).toBeInTheDocument();
    // Once definitions resolve, the weight row shows its unit select ("kg").
    expect(await screen.findByText('kg')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1.5')).toBeInTheDocument();
  });

  // PRE-02: the key select excludes keys already used by other rows.
  it('excludes already-used keys from the key select', async () => {
    renderEditor([{ definition_id: 'd-color', value: 'red' }]);
    await screen.findByText('Color');
    fireEvent.click(screen.getByRole('button', { name: /Add parameter/ }));
    const selects = screen.getAllByRole('combobox');
    fireEvent.mouseDown(selects[selects.length - 1]!);
    const listbox = lastDropdown();
    expect(within(listbox).getByText('Weight')).toBeInTheDocument();
    expect(within(listbox).getByText('capacity')).toBeInTheDocument();
    expect(within(listbox).queryByText('Color')).toBeNull();
  });

  // PRE-03: removing a row propagates through onChange.
  it('removes a row via its remove button', async () => {
    const onChange = vi.fn();
    renderEditor(
      [
        { definition_id: 'd-color', value: 'red' },
        { definition_id: 'd-capacity', value: '42' },
      ],
      onChange,
    );
    await screen.findByDisplayValue('red');
    const removes = screen.getAllByRole('button', { name: /remove-parameter/ });
    fireEvent.click(removes[0]!);
    expect(onChange).toHaveBeenCalledWith([{ definition_id: 'd-capacity', value: '42' }]);
  });

  // PRE-04: the create-new flow collects name + type (+ unit family) and calls the API.
  it('creates a new definition inline', async () => {
    const created = {
      id: 'd-new', content_type: 7, content_type_label: 'inventory.item', name: 'depth',
      data_type: 'dimension', unit_family: 'length', is_system: false, display_order: 11, options: [],
    } as AttributeDefinition;
    vi.mocked(coreService.createAttributeDefinition).mockResolvedValue(created);
    const onChange = vi.fn();
    renderEditor([], onChange);
    await screen.findByRole('button', { name: /Add parameter/ });
    fireEvent.click(screen.getByRole('button', { name: /Add parameter/ }));
    // Open the new row's key select and pick "+ New parameter…".
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]!);
    fireEvent.click(within(lastDropdown()).getByText(/New parameter/));
    // Inline creation panel: name, type, unit family.
    fireEvent.change(screen.getByPlaceholderText('Parameter name'), { target: { value: 'depth' } });
    const typeSelect = screen.getAllByRole('combobox').pop()!;
    fireEvent.mouseDown(typeSelect);
    fireEvent.click(within(lastDropdown()).getByText('Dimension'));
    const familySelect = screen.getAllByRole('combobox').pop()!;
    fireEvent.mouseDown(familySelect);
    fireEvent.click(within(lastDropdown()).getByText('Length'));
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
    await waitFor(() =>
      expect(vi.mocked(coreService.createAttributeDefinition)).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'depth', data_type: 'dimension', unit_family: 'length' }),
        expect.anything(), // TanStack v5 passes a mutation context as arg 2
      ),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ definition_id: 'd-new' })]),
    );
  });
});

describe('ParameterRowsEditor (iteration 16 — form grid + definition delete)', () => {
  beforeEach(() => {
    vi.mocked(coreService.listAttributeDefinitions).mockResolvedValue(DEFS);
  });

  // PRE16-01 (FR-026): rows sit on the form grid, not a fixed 40%/52% compact split.
  it('lays parameter rows on the form grid without fixed percentage panes', async () => {
    const { container } = renderEditor([{ definition_id: 'd-color', value: 'red' }]);
    await screen.findByDisplayValue('red');
    // Key select lives inside a grid Col.
    expect(container.querySelector('.ant-row .ant-col .ant-select')).toBeTruthy();
    // No fixed percentage widths on the row panes (the old Space.Compact split).
    expect(container.querySelector('[style*="width: 40%"]')).toBeNull();
    expect(container.querySelector('[style*="width: 52%"]')).toBeNull();
  });

  // PRE16-02 (FR-026): delete affordance only on user-defined keys.
  it('shows a delete affordance only on user-defined keys', async () => {
    renderEditor([]);
    fireEvent.click(await screen.findByRole('button', { name: /Add parameter/ }));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]!);
    const listbox = lastDropdown();
    const capacity = within(listbox).getByText('capacity').closest('.ant-select-item') as HTMLElement;
    expect(within(capacity).getByLabelText('delete-definition')).toBeInTheDocument();
    const color = within(listbox).getByText('Color').closest('.ant-select-item') as HTMLElement;
    expect(within(color).queryByLabelText('delete-definition')).toBeNull();
  });

  // PRE16-03 (FR-026): two-step count-confirm delete, row cleanup, list refetch.
  it('deletes a user definition with count-confirm and clears rows using it', async () => {
    vi.mocked(coreService.deleteAttributeDefinition)
      .mockRejectedValueOnce(
        Object.assign(new Error('confirm required'), {
          status: 400,
          body: { affected_entity_count: 3 },
        }),
      )
      .mockResolvedValueOnce(undefined);
    const onChange = vi.fn();
    renderEditor(
      [
        { definition_id: 'd-capacity', value: '42' },
        { definition_id: 'd-color', value: 'red' },
      ],
      onChange,
    );
    // Wait for definitions to resolve (the key label renders) before opening.
    await screen.findByText('capacity');
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]!);
    const listbox = lastDropdown();
    const capacity = within(listbox).getByText('capacity').closest('.ant-select-item') as HTMLElement;
    fireEvent.click(within(capacity).getByLabelText('delete-definition'));
    // Probe without confirm → 400 carries the affected count.
    await waitFor(() =>
      expect(vi.mocked(coreService.deleteAttributeDefinition)).toHaveBeenCalledWith('d-capacity'),
    );
    // Count-confirm modal (danger) shows the affected count.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/3/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/ }));
    await waitFor(() =>
      expect(vi.mocked(coreService.deleteAttributeDefinition)).toHaveBeenLastCalledWith(
        'd-capacity',
        true,
      ),
    );
    // Rows keyed to the deleted definition are dropped; others untouched.
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([{ definition_id: 'd-color', value: 'red' }]),
    );
    // Definition queries invalidated (list refetched).
    await waitFor(() =>
      expect(vi.mocked(coreService.listAttributeDefinitions).mock.calls.length).toBeGreaterThan(1),
    );
  });

  // PRE-08 (iteration 26, FR-002b): the three new unit families are offered
  // when creating a dimension definition, and their units drive the unit select.
  it('offers temperature/time/battery families and their units', async () => {
    renderEditor([{ definition_id: 'd-batt', value: '10', unit: 'Ah' }]);
    // Battery row exposes its family units in the unit select.
    expect(await screen.findByText('Ah')).toBeInTheDocument();
    // New-definition draft: family select lists the new families.
    fireEvent.click(screen.getByRole('button', { name: /Add parameter/ }));
    const selects = screen.getAllByRole('combobox');
    fireEvent.mouseDown(selects[selects.length - 1]!);
    fireEvent.click(within(lastDropdown()).getByText('+ New parameter…'));
    const typeSelect = screen.getAllByRole('combobox');
    fireEvent.mouseDown(typeSelect[typeSelect.length - 1]!);
    fireEvent.click(within(lastDropdown()).getByText('Dimension'));
    const familySelect = screen.getAllByRole('combobox');
    fireEvent.mouseDown(familySelect[familySelect.length - 1]!);
    const listbox = lastDropdown();
    expect(within(listbox).getByText('Temperature')).toBeInTheDocument();
    expect(within(listbox).getByText('Time')).toBeInTheDocument();
    expect(within(listbox).getByText('Battery capacity')).toBeInTheDocument();
  });

  // PRE-09 (iteration 26, FR-002b): dimension values accept "5" and "5-10";
  // an invalid range shows the localized validation message.
  it('accepts single and range dimension values, flags invalid ranges', async () => {
    const onChange = vi.fn();
    renderEditor([{ definition_id: 'd-weight', value: '1.5', unit: 'kg' }], onChange);
    const input = await screen.findByDisplayValue('1.5');
    fireEvent.change(input, { target: { value: '5-10' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { definition_id: 'd-weight', value: '5-10', unit: 'kg' },
    ]);
    expect(screen.queryByText('Enter a number or a min-max range (e.g. 5-10)')).toBeNull();
    fireEvent.change(screen.getByDisplayValue('5-10'), { target: { value: '10-5' } });
    expect(
      await screen.findByText('Enter a number or a min-max range (e.g. 5-10)'),
    ).toBeInTheDocument();
  });
});
