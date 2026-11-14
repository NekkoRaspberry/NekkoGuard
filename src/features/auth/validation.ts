const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Mirrors Django's MinimumLengthValidator default; the server applies all four validators. */
export const PASSWORD_MIN_LENGTH = 8;

export function validateNewPassword(password: string, confirmation: string): { password?: string; confirm?: string } {
  const errors: { password?: string; confirm?: string } = {};
  if (!password) errors.password = 'Choose a password.';
  else if (password.length < PASSWORD_MIN_LENGTH) errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password && confirmation !== password) errors.confirm = 'The passwords do not match.';
  return errors;
}
