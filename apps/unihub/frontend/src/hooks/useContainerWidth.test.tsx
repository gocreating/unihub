/**
 * useContainerWidth — regression tests.
 *
 * The hook MUST be callback-ref based: AntD Modal lazy-mounts its children on
 * first open, so a mount-time effect would run while the container node is
 * still null and never attach the ResizeObserver (the original bug — modal
 * form fields never stacked because isNarrow never became true).
 */
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { useContainerWidth } from './useContainerWidth';
import { ResizeObserverMock } from '../test-setup';

function Probe({ breakpoint }: { breakpoint?: number }) {
  const { ref, isNarrow } = useContainerWidth(breakpoint);
  return (
    <div ref={ref} data-testid="container">
      {isNarrow ? 'narrow' : 'wide'}
    </div>
  );
}

/** Mounts the probe only after a toggle — mimicking AntD Modal's lazy mount. */
function LazyHost() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      {open && <Probe breakpoint={640} />}
    </div>
  );
}

function mockWidth(el: Element, width: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 100,
    top: 0,
    left: 0,
    right: width,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('useContainerWidth', () => {
  it('attaches the observer when the node mounts LATE (modal lazy-mount)', async () => {
    render(<LazyHost />);
    // Nothing observed while the content is unmounted.
    expect(ResizeObserverMock.instances.flatMap((i) => i.targets)).toHaveLength(0);

    // "Open the modal" — the probe mounts now; the callback ref must observe it.
    await act(async () => {
      screen.getByText('open').click();
    });
    const observed = ResizeObserverMock.instances.flatMap((i) => i.targets);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBe(screen.getByTestId('container'));
  });

  it('flips isNarrow when the observed width drops below the breakpoint', async () => {
    render(<Probe breakpoint={640} />);
    const el = screen.getByTestId('container');
    const instance = ResizeObserverMock.instances.find((i) => i.targets.includes(el));
    expect(instance).toBeTruthy();

    mockWidth(el, 500);
    await act(async () => {
      instance!.trigger();
    });
    expect(el.textContent).toBe('narrow');

    mockWidth(el, 900);
    await act(async () => {
      instance!.trigger();
    });
    expect(el.textContent).toBe('wide');
  });
});
