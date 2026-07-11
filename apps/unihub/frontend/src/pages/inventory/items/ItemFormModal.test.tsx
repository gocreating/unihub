/**
 * ItemFormModal — form-constitution regression tests (Principle VI).
 *
 * Locks the repeatedly-reported violations:
 *   1. Footer: Cancel flushed LEFT, primary Save on the RIGHT (space-between) —
 *      AntD's default footer right-aligns the whole group.
 *   2. Field order: Name, quantity, SKU price, spec, URL, remark, color, size,
 *      weight, length, width, height, volume.
 *   3. Fields STACK to full-width columns when the modal content is narrow —
 *      possible only because useContainerWidth uses a callback ref (AntD Modal
 *      lazy-mounts its children, so a mount-effect observer never attached).
 */
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { ItemFormModal } from './ItemFormModal';
import { ResizeObserverMock } from '../../../test-setup';

function renderModal() {
  return render(
    <IntlProvider locale="en-US" messages={enUS}>
      <ItemFormModal
        open
        title="Add Item"
        initial={null}
        currencyOptions={[]}
        onOk={vi.fn()}
        onCancel={vi.fn()}
      />
    </IntlProvider>,
  );
}

function mockWidth(el: Element, width: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 400,
    top: 0,
    left: 0,
    right: width,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('ItemFormModal (Principle VI)', () => {
  it('footer places Cancel flushed left and Save on the right (space-between)', () => {
    renderModal();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save' });
    const footer = cancel.parentElement!;
    // Same flex container, space-between, Cancel before Save in DOM order.
    expect(footer).toBe(save.parentElement);
    expect(footer.style.display).toBe('flex');
    expect(footer.style.justifyContent).toBe('space-between');
    const order: Element[] = Array.from(footer.querySelectorAll('button'));
    expect(order.indexOf(cancel)).toBeLessThan(order.indexOf(save));
  });

  it('orders fields: Name, Quantity, SKU Price, Spec, URL, Remark, Color, Size, Weight, Length, Width, Height, Volume', () => {
    renderModal();
    const labels = Array.from(document.querySelectorAll('.ant-form-item-label label')).map(
      (l) => l.textContent,
    );
    expect(labels).toEqual([
      'Name',
      'Quantity',
      'SKU Price',
      'Spec',
      'URL',
      'Remark',
      'Color',
      'Size',
      'Weight',
      'Length',
      'Width',
      'Height',
      'Volume',
    ]);
  });

  it('stacks fields to full-width columns when the modal content is narrow', async () => {
    renderModal();
    // The callback ref observed the modal's content container (lazy-mounted).
    const instance = ResizeObserverMock.instances.find((i) => i.targets.length > 0);
    expect(instance).toBeTruthy();
    const container = instance!.targets[0]!;

    // The grid Col is the ancestor with an explicit span class (ant-col-N);
    // the inner ant-form-item-control is also an .ant-col but span-less.
    const gridCol = (label: string) =>
      screen.getByLabelText(label).closest('[class*="ant-col-"]') as HTMLElement;

    // Wide: the Name field sits in a half-width column.
    mockWidth(container, 900);
    await act(async () => instance!.trigger());
    expect(gridCol('Name').className).toContain('ant-col-12');

    // Narrow: every field stacks to a full-width column.
    mockWidth(container, 400);
    await act(async () => instance!.trigger());
    expect(gridCol('Name').className).toContain('ant-col-24');
    expect(gridCol('Quantity').className).toContain('ant-col-24');
  });
});
