const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const calendarDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' });

export function formatTime(timestamp: number): string {
  return timeFormatter.format(timestamp);
}

export function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(timestamp);
}

/** A calendar date ("YYYY-MM-DD", no time zone) — e.g. a release or effective date. */
export function formatCalendarDate(isoDate: string): string {
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(timestamp) ? isoDate : calendarDateFormatter.format(timestamp);
}

export function formatRelative(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 10) return 'just now';
  if (abs < 60) return relativeFormatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormatter.format(hours, 'hour');
  return relativeFormatter.format(Math.round(hours / 24), 'day');
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  return `${Math.max(1, Math.round(ms))} ms`;
}

/** Initials for the avatar: from the display name, falling back to the email. */
export function initialsFor(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : source.slice(0, 2);
  return letters.toUpperCase();
}
