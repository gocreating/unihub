import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClampedText } from './index';

/** jsdom reports 0 for both metrics, so overflow is simulated explicitly. */
function mockOverflow(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClampedText', () => {
  it('renders its text', () => {
    render(<ClampedText text="每月 13, 29 日 10000 元" />);
    expect(screen.getByText('每月 13, 29 日 10000 元')).toBeInTheDocument();
  });

  it('clamps to two lines by default', () => {
    render(<ClampedText text="some long description" />);
    const span = screen.getByText('some long description');
    expect(span).toHaveStyle({ overflow: 'hidden' });
    expect(span.style.webkitLineClamp).toBe('2');
    // PageTable forces nowrap on cells; the clamp must re-enable wrapping.
    expect(span.style.whiteSpace).toBe('normal');
  });

  it('honours a custom line count', () => {
    render(<ClampedText text="three liner" lines={3} />);
    expect(screen.getByText('three liner').style.webkitLineClamp).toBe('3');
  });

  it('shows a tooltip only when the text is actually truncated', async () => {
    render(<ClampedText text="Roll PT-USD0++-27FEB2025 to PT-USD0++-26JUN2025" />);
    const span = screen.getByText(/Roll PT-USD0/);
    mockOverflow(span, 60, 40); // vertical overflow → truncated
    fireEvent.mouseEnter(span);
    await waitFor(() => {
      expect(screen.getAllByText(/Roll PT-USD0/).length).toBeGreaterThan(1);
    });
  });

  it('shows NO tooltip when the text fits', async () => {
    render(<ClampedText text="short" />);
    const span = screen.getByText('short');
    mockOverflow(span, 20, 20); // fits
    fireEvent.mouseEnter(span);
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getAllByText('short')).toHaveLength(1);
  });

  it('detects truncation by HEIGHT, not width (the single-line check cannot)', async () => {
    render(<ClampedText text="clamped two line content" />);
    const span = screen.getByText('clamped two line content');
    // A clamped box reports equal scroll/client WIDTH — width-based detection
    // would report "fits" here, which is exactly the bug this component avoids.
    Object.defineProperty(span, 'scrollWidth', { value: 200, configurable: true });
    Object.defineProperty(span, 'clientWidth', { value: 200, configurable: true });
    mockOverflow(span, 60, 40);
    fireEvent.mouseEnter(span);
    await waitFor(() => {
      expect(screen.getAllByText('clamped two line content').length).toBeGreaterThan(1);
    });
  });

  it('renders custom children while tooltipping the full raw text', () => {
    render(
      <ClampedText text="full raw value">
        <mark>highlighted</mark>
      </ClampedText>,
    );
    expect(screen.getByText('highlighted')).toBeInTheDocument();
  });
});
