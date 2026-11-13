// Parse an Apple Notes checklist pasted as text.
//
//   Walmart          <- outer header (a header directly followed by another header)
//   Protein          <- inner header
//   - [x] Fairlife milk
//
// Returns [{ name, checked, group, outer }]. `group` is the nearest header,
// `outer` is the most recent outer header (or '' if none).
// Also accepts "☐ / ☑ / ✓" markers and plain "- item" bullets.

const ITEM = /^\s*(?:[-*•]\s*)?(?:\[( |x|X)\]|(☐|☑|✅|✔|✓))\s*(.+)$/;
const BULLET = /^\s*[-*•]\s+(.+)$/;

export function parseChecklist(text) {
  const rows = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trimEnd())
    .filter((l) => l.trim());

  const parsed = rows.map((l) => {
    const m = l.match(ITEM);
    if (m) return { item: true, checked: m[1] ? m[1].toLowerCase() === 'x' : m[2] !== '☐', name: m[3].trim() };
    const b = l.match(BULLET);
    if (b) return { item: true, checked: false, name: b[1].trim() };
    return { item: false, name: l.trim() };
  });

  const out = [];
  let group = '';
  let outer = '';
  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i];
    if (r.item) {
      if (r.name) out.push({ name: r.name, checked: r.checked, group, outer });
      continue;
    }
    const next = parsed[i + 1];
    if (next && !next.item) {
      outer = r.name; // header followed by header -> outer section
    } else {
      group = r.name;
    }
  }
  return out;
}
