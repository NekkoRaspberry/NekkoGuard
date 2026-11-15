import type { BugCategory, BugSeverity } from '@/api/help';

/** Choices and limits of the Report a bug form (mirror nekkoguard/support/models.py). */

export const CATEGORY_OPTIONS: { value: BugCategory | ''; label: string }[] = [
  { value: '', label: 'Not specified' },
  { value: 'ui', label: 'UI / Visual issue' },
  { value: 'functional', label: 'Functional issue' },
  { value: 'performance', label: 'Performance issue' },
  { value: 'data', label: 'Data issue' },
  { value: 'access', label: 'Authentication / Access issue' },
  { value: 'other', label: 'Other' },
];

export const SEVERITY_OPTIONS: { value: BugSeverity | ''; label: string }[] = [
  { value: '', label: 'Not specified' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Client-side check for a quick message; the backend validates the file again. */
export function validateAttachment(file: File): string | null {
  if (!ATTACHMENT_TYPES.includes(file.type)) return 'Attach a PNG, JPEG or WebP image.';
  if (file.size > ATTACHMENT_MAX_BYTES) return 'The screenshot must be 2 MB or smaller.';
  return null;
}
