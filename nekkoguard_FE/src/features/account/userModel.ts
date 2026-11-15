import type { UserDto } from '@/api/types';

export interface CurrentUser {
  id: number;
  email: string;
  /** Display name; may be empty (the backend allows a blank name). */
  name: string;
  isStaff: boolean;
  mfaEnabled: boolean;
  /** Administers a Tenant, but this session has not passed MFA: Member rights until
   *  MFA is set up (or, when `mfaEnabled`, confirmed with a code). Backend-enforced. */
  mfaRequired: boolean;
}

export function toCurrentUser(dto: UserDto): CurrentUser {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    isStaff: dto.is_staff,
    mfaEnabled: dto.mfa_enabled ?? false,
    mfaRequired: dto.mfa_required ?? false,
  };
}

/** `User.name` is CharField(max_length=255, blank=True). */
export const NAME_MAX_LENGTH = 255;
