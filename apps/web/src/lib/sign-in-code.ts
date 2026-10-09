// The sign-in code's shape, defined once for the auth config, the code email and the sign-in
// screen (accounts-and-sign-in.md § Codes); src/server/auth/config.test.ts pins them together.
export const SIGN_IN_CODE_LENGTH = 6
export const SIGN_IN_CODE_TTL_SECONDS = 10 * 60
export const SIGN_IN_CODE_ATTEMPTS = 3
