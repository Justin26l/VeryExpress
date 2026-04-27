// {{headerComment}}
import crypto from "crypto";
// import log from "~/utils/logger";
import { User } from "../_types/User.gen";

/**
 * Hashes a password with a salt (e.g., user email).
 * @param plainPassword The plain text password to hash.
 * @param salt The salt to use (e.g., user email).
 * @param algorithm The hash algorithm (default: 'sha256').
 * @returns The hashed password (hex encoded).
 */
export function hashPassword(
    plainPassword: string,
    salt: string,
    algorithm: "sha256" = "sha256"
): string {
    return crypto.createHash(algorithm).update(plainPassword + salt).digest("hex");
}

/**
 * Verifies if a plain password (with salt) matches a given hashed password.
 * @param user The user object containing email and userAuthProfiles.
 * @param plainPassword The plain text password to verify.
 * @returns True if the password matches, false otherwise.
 */
export function verifyPassword(
    user: User,
    plainPassword: string,
): boolean {
    if(!user.email || !user.userAuthProfiles) {
        // log.error(`User "${user._id}" email or userAuthProfiles missing for local auth's password verification.`);
        return false;
    }

    const hashedPassword = user.userAuthProfiles.find((profile:any) => profile.provider === "local")?.password;
    if(!hashedPassword) {
        // log.error(`User "${user._id}" Local auth profile or password missing.`);
        return false;
    }

    return hashPassword(plainPassword, user.email) === hashedPassword;
}

export default {
    hashPassword,
    verifyPassword
};