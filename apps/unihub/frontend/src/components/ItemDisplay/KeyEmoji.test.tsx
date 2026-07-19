/**
 * Iteration 46 (FR-032): emoji ink centering is guaranteed BY CONSTRUCTION —
 * the glyph renders into a canvas, its ACTUAL ink is pixel-scanned, cropped,
 * and painted as a centered currentColor mask. These tests cover the pure ink
 * math, the mask path (mocked canvas), the JSDOM/text fallback, and caching.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { KeyEmoji } from './index';
import { inkBounds } from './emojiInk';

afterEach(() => {
  vi.restoreAllMocks();
});

function rgba(w: number, h: number, ink: { x0: number; y0: number; x1: number; y1: number } | null, alpha = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  if (ink) {
    for (let y = ink.y0; y <= ink.y1; y++) {
      for (let x = ink.x0; x <= ink.x1; x++) {
        data[(y * w + x) * 4 + 3] = alpha;
      }
    }
  }
  return data;
}

describe('inkBounds (pure ink math)', () => {
  it('finds the exact bounding box of bottom-hanging ink', () => {
    // Ink parked at the BOTTOM of the box — the reproduced bug shape.
    const data = rgba(10, 10, { x0: 2, y0: 7, x1: 5, y1: 9 });
    expect(inkBounds(data, 10, 10)).toEqual({ x0: 2, y0: 7, x1: 5, y1: 9 });
  });

  it('returns null for an empty (no-ink) box', () => {
    expect(inkBounds(rgba(8, 8, null), 8, 8)).toBeNull();
  });

  it('covers the full box when ink fills it', () => {
    const data = rgba(4, 4, { x0: 0, y0: 0, x1: 3, y1: 3 });
    expect(inkBounds(data, 4, 4)).toEqual({ x0: 0, y0: 0, x1: 3, y1: 3 });
  });

  it('ignores near-transparent antialiasing noise', () => {
    const data = rgba(6, 6, { x0: 0, y0: 0, x1: 5, y1: 5 }, 8); // below threshold
    expect(inkBounds(data, 6, 6)).toBeNull();
  });

  it('finds a single ink pixel', () => {
    const data = rgba(5, 5, { x0: 4, y0: 0, x1: 4, y1: 0 });
    expect(inkBounds(data, 5, 5)).toEqual({ x0: 4, y0: 0, x1: 4, y1: 0 });
  });
});

function mockCanvas(ink: { x0: number; y0: number; x1: number; y1: number } | null) {
  const drawImage = vi.fn();
  const fillText = vi.fn();
  const ctx = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillText,
    drawImage,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: rgba(w, h, ink),
      width: w,
      height: h,
    }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  const toDataURL = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValue('data:image/png;base64,FAKEMASK');
  return { drawImage, fillText, toDataURL };
}

describe('KeyEmoji mask path (canvas available)', () => {
  it('paints a cropped currentColor ink mask instead of glyph text', () => {
    const { drawImage, toDataURL } = mockCanvas({ x0: 30, y0: 70, x1: 90, y1: 120 });
    const { container } = render(<KeyEmoji emoji="⚖" />);
    const span = container.querySelector('[data-testid="key-emoji"]') as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.getAttribute('data-emoji')).toBe('⚖');
    // The mask IS the measured ink — centered by construction.
    expect(span.style.maskImage || span.style.webkitMaskImage).toContain('FAKEMASK');
    expect(span.style.backgroundColor).toBe('currentcolor');
    expect((span.style.maskPosition || span.style.webkitMaskPosition)).toBe('center');
    expect((span.style.maskSize || span.style.webkitMaskSize)).toBe('contain');
    // No glyph text in the mask path — the ink rendering replaces it.
    expect(span.textContent).toBe('');
    // The crop copied exactly the padded ink bounds from the render canvas.
    expect(drawImage).toHaveBeenCalled();
    const args = drawImage.mock.calls[0]!;
    const pad = 2;
    expect(args.slice(1, 5)).toEqual([30 - pad, 70 - pad, 90 - 30 + 1 + pad * 2, 120 - 70 + 1 + pad * 2]);
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it('caches the mask per glyph — one canvas render for repeated use', () => {
    const { toDataURL } = mockCanvas({ x0: 10, y0: 10, x1: 20, y1: 20 });
    render(
      <>
        <KeyEmoji emoji="🧴" />
        <KeyEmoji emoji="🧴" />
        <KeyEmoji emoji="🧴" />
      </>,
    );
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it('falls back to glyph text when the glyph produces no ink', () => {
    mockCanvas(null); // e.g. blank glyph
    const { container } = render(<KeyEmoji emoji="🈳" />);
    const span = container.querySelector('[data-testid="key-emoji"]') as HTMLElement;
    expect(span.textContent).toBe('🈳');
  });
});

describe('KeyEmoji fallback path (no canvas — JSDOM/SSR)', () => {
  it('renders the monochrome silhouette glyph text', () => {
    // jsdom's getContext returns null by default → text fallback.
    const { container } = render(<KeyEmoji emoji="🎁" />);
    const span = container.querySelector('[data-testid="key-emoji"]') as HTMLElement;
    expect(span.textContent).toBe('🎁');
    expect(span.style.webkitTextFillColor).toBe('transparent');
    expect(span.style.textShadow).toContain('currentcolor');
  });

  it('renders nothing for an empty emoji', () => {
    const { container } = render(<KeyEmoji emoji="" />);
    expect(container.querySelector('[data-testid="key-emoji"]')).toBeNull();
  });
});
