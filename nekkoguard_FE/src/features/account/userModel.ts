import type { UserDto } from '@/api/types';

export interface CurrentUser {
  id: number;
  email: string;
  /** Display name; may be empty (the backend allows a blank name). */
  name: string;
  isStaff: boolean;
}

export function toCurrentUser(dto: UserDto): CurrentUser {
  return { id: dto.id, email: dto.email, name: dto.name, isStaff: dto.is_staff };
}

/** `User.name` is CharField(max_length=255, blank=True). */
export const NAME_MAX_LENGTH = 255;
