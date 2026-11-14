/**
 * Wire types — mirror the backend serializers exactly.
 * Backend source: nekkoguard/users/api/serializers.py, rest_framework.authtoken.
 */

/** `POST /api/auth-token/` request. DRF's AuthTokenSerializer calls the email field `username`. */
export interface AuthTokenRequestDto {
  username: string;
  password: string;
}

/** `POST /api/auth-token/` response. */
export interface AuthTokenResponseDto {
  token: string;
}

/** `UserSerializer` — fields `name` and `url` only (email, id and flags are not exposed). */
export interface UserDto {
  name: string;
  url: string;
}

/** Writable fields of `UserSerializer` (PATCH /api/users/{pk}/). */
export interface UserUpdateDto {
  name: string;
}
