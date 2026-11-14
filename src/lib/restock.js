// "Running low" suggestions from how often you buy something.
// Dates are YYYY-MM-DD strings.

import { median } from './stats.js';

const DAY = 864e5;
const toDay = (iso) => Math.floor(Date.parse(iso + 'T12:00:00Z') / DAY);

/**
 * From a list of purchase dates, work out the usual gap and when it's due next.
 * Needs at least 2 distinct dates. Gaps shorter than 2 days are ignored (same trip, split receipts).
 * Returns { every, last, due, daysSince, daysLeft } or null.
 */
export function restockInfo(dates, today) {
  const days = [...new Set(dates.filter(Boolean).map(toDay))].sort((a, b) => a - b);
  if (days.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < days.length; i++) {
    const g = days[i] - days[i - 1];
    if (g >= 2) gaps.push(g);
  }
  if (!gaps.length) return null;
  const every = Math.round(median(gaps.slice(-6))); // recent habits matter most
  const last = days[days.length - 1];
  const now = toDay(today);
  const daysSince = now - last;
  return { every, last: new Date(last * DAY).toISOString().slice(0, 10), daysSince, daysLeft: every - daysSince };
}

/**
 * Items that are probably running low: not already on the list or in the cart, not snoozed,
 * and within `lead` days of their usual gap (or past it).
 * datesFor(item) returns that item's purchase dates.
 */
export function runningLow(items, datesFor, today, lead = 1) {
  const out = [];
  for (const g of items) {
    if (g.status !== 'stocked') continue;
    if (g.snoozeUntil && g.snoozeUntil > today) continue;
    const info = restockInfo(datesFor(g), today);
    if (info && info.daysLeft <= lead) out.push({ item: g, ...info });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Add today's date to an item's purchase dates (deduped, newest last, keep the last 12). */
export function addBoughtDate(dates = [], today) {
  return [...new Set([...dates, today])].sort().slice(-12);
}
