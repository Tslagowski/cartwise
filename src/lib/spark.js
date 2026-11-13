/**
 * SVG path for a sparkline. Values are drawn left → right, scaled to fit
 * a w×h box with `pad` px inside. Returns '' for fewer than 2 values.
 */
export function sparkPath(values, w, h, pad = 2) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min;
  const stepX = (w - pad * 2) / (v.length - 1);
  const y = (x) => (span === 0 ? h / 2 : pad + (h - pad * 2) * (1 - (x - min) / span));
  return v.map((x, i) => `${i ? 'L' : 'M'}${(pad + i * stepX).toFixed(1)} ${y(x).toFixed(1)}`).join(' ');
}

/** Coordinates of the last point, for an end dot. */
export function sparkEnd(values, w, h, pad = 2) {
  const d = sparkPath(values, w, h, pad);
  if (!d) return null;
  const m = d.match(/([\d.]+) ([\d.]+)$/);
  return { x: Number(m[1]), y: Number(m[2]) };
}
