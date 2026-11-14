/**
 * Wire types — mirror the backend exactly.
 * DRF: nekkoguard/users/api/serializers.py
 * allauth headless: allauth/headless/spec/doc/openapi.yaml (django-allauth 65.21)
 */

// ---------------------------------------------------------------- DRF

/** `UserSerializer` — only `name` is writable. */
export interface UserDto {
  id: number;
  email: string;
  name: string;
  is_staff: boolean;
  url: string;
}

export interface UserUpdateDto {
  name: string;
}

// ---------------------------------------------------------------- allauth headless

export type FlowId =
  | 'login'
  | 'signup'
  | 'verify_email'
  | 'mfa_authenticate'
  | 'reauthenticate'
  | 'mfa_reauthenticate'
  | 'login_by_code'
  | 'provider_redirect'
  | 'provider_signup'
  | 'provider_token'
  | 'verify_phone';

export interface Flow {
  id: FlowId;
  is_pending?: boolean;
  /** For MFA flows: the authenticator types available (e.g. totp, recovery_codes). */
  types?: string[];
}

export interface AllauthUser {
  id: number;
  display: string;
  email: string | null;
  has_usable_password: boolean;
}

export interface AllauthError {
  message: string;
  code: string;
  param?: string;
}

export interface AllauthEnvelope<TData = unknown, TMeta extends object = Record<string, unknown>> {
  status: number;
  data?: TData;
  meta?: TMeta;
  errors?: AllauthError[];
}

export interface AuthMeta {
  is_authenticated: boolean;
}

/** 200 = authenticated; 401 = not (yet) authenticated, `flows` says what can happen next. */
export interface SessionData {
  user?: AllauthUser;
  methods?: unknown[];
  flows?: Flow[];
}

export type SessionEnvelope = AllauthEnvelope<SessionData, AuthMeta>;

export interface EmailAddressDto {
  email: string;
  primary: boolean;
  verified: boolean;
}

export interface TotpAuthenticatorDto {
  type: 'totp';
  created_at: number;
  last_used_at: number | null;
}

export interface RecoveryCodesAuthenticatorDto {
  type: 'recovery_codes';
  created_at: number;
  last_used_at: number | null;
  total_code_count: number;
  unused_code_count: number;
  /** Only present on GET/POST /account/authenticators/recovery-codes. */
  unused_codes?: string[];
}

export type AuthenticatorDto = TotpAuthenticatorDto | RecoveryCodesAuthenticatorDto;

/** Meta of a 404 from GET /account/authenticators/totp — material to set up a new authenticator. */
export interface TotpSetupMeta {
  secret: string;
  totp_url: string;
}

/** A third-party sign-in provider configured on the backend (Google, GitHub, LinkedIn). */
export interface ProviderDto {
  id: string;
  name: string;
  client_id?: string;
  flows: string[];
}

/** A provider account linked to the signed-in user. */
export interface ProviderAccountDto {
  uid: string;
  display: string;
  provider: ProviderDto;
}

export interface ProviderSignupInfoDto {
  email: EmailAddressDto[];
  account: ProviderAccountDto;
  user: AllauthUser;
}

export type ProviderProcess = 'login' | 'connect';

export interface ConfigDto {
  socialaccount?: {
    providers: ProviderDto[];
  };
  account: {
    login_methods?: string[];
    is_open_for_signup: boolean;
    email_verification_by_code_enabled: boolean;
    login_by_code_enabled: boolean;
    password_reset_by_code_enabled?: boolean;
  };
  mfa?: {
    supported_types: string[];
  };
}

export interface EmailVerificationInfoDto {
  email: string;
  user: AllauthUser;
}
