// The sign-in code's shape, defined once for the auth config, the code email and the sign-in
// screen (accounts-and-sign-in.md § Codes); src/server/auth/config.test.ts pins them together.
export const SIGN_IN_CODE_LENGTH = 6
export const SIGN_IN_CODE_TTL_SECONDS = 10 * 60
export const SIGN_IN_CODE_ATTEMPTS = 3

/**
 * The digits of a pasted, typed or autofilled code ("482 913" is 482913): the sign-in screen
 * reads codes with it, and the server's sign-in hook normalizes a guess with it.
 */
export function signInCodeDigits(value: string): string {
  return value.replace(/\D/g, '')
}
