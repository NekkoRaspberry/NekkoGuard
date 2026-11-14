import type { UserDto } from '@/api/types';

export interface CurrentUser {
  /** Primary key parsed from the hyperlinked `url` field; null if the URL is not recognised. */
  id: number | null;
  /** Display name; may be empty (the backend allows a blank name). */
  name: string;
}

const USER_DETAIL_PATTERN = /\/api\/users\/(\d+)\/?$/;

/** The serializer only exposes `url`, so the user id is read from its path. */
export function parseUserId(url: string): number | null {
  try {
    const { pathname } = new URL(url, window.location.origin);
    const match = USER_DETAIL_PATTERN.exec(pathname);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export function toCurrentUser(dto: UserDto): CurrentUser {
  return { id: parseUserId(dto.url), name: dto.name };
}

/** `User.name` is CharField(max_length=255, blank=True). */
export const NAME_MAX_LENGTH = 255;
