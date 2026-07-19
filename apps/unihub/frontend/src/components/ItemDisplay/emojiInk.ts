/**
 * Alpha-channel ink bounding box of an RGBA pixel buffer (FR-032, iteration
 * 46). Exported pure math so the reproduction tests can drive it directly.
 * Near-transparent antialiasing (alpha ≤ 16) does not count as ink.
 */
export function inkBounds(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// Ink-mask rendering (FR-032, iteration 46): centering is guaranteed BY
// CONSTRUCTION. Emoji fonts place ink inside the glyph box per their own,
// platform-dependent metrics — box centering, vertical-align tweaks (iter 41)
// and even canvas font-metric compensation (iter 45) all failed because the
// DISPLAYED ink never matched what was measured. Now the glyph is drawn into
// a canvas, its ACTUAL ink pixels are scanned and cropped, and that crop is
// painted as a centered `mask-image` filled with currentColor — the displayed
// pixels ARE the measured pixels, so no font on any platform can misplace
// them (and the silhouette stays monochrome by design).
const EMOJI_MASK_PAD = 2;
const maskCache = new Map<string, string | null>();

export function emojiMask(emoji: string): string | null {
  const cached = maskCache.get(emoji);
  if (cached !== undefined) return cached;
  let url: string | null = null;
  try {
    const S = 128;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `${Math.round(S * 0.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, S / 2, S / 2);
      const img = ctx.getImageData(0, 0, S, S);
      const b = inkBounds(img.data, S, S);
      if (b) {
        const w = b.x1 - b.x0 + 1 + EMOJI_MASK_PAD * 2;
        const h = b.y1 - b.y0 + 1 + EMOJI_MASK_PAD * 2;
        const crop = document.createElement('canvas');
        crop.width = w;
        crop.height = h;
        const cctx = crop.getContext('2d');
        if (cctx) {
          cctx.drawImage(canvas, b.x0 - EMOJI_MASK_PAD, b.y0 - EMOJI_MASK_PAD, w, h, 0, 0, w, h);
          url = crop.toDataURL();
        }
      }
    }
  } catch {
    url = null;
  }
  maskCache.set(emoji, url);
  return url;
}

