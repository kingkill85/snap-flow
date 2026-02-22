import { compareSync, genSaltSync, hashSync } from "bcrypt";

const SALT_ROUNDS = 10;

/**
 * Hash a password (sync version - avoids Web Worker issues)
 */
export function hashPassword(password: string): string {
  const salt = genSaltSync(SALT_ROUNDS);
  return hashSync(password, salt);
}

/**
 * Compare a password with a hash (sync version)
 */
export function comparePassword(password: string, hash: string): boolean {
  return compareSync(password, hash);
}
