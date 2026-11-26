// {{headerComment}}
import crypto from "crypto";

/** The identity fields this module reads — any row carrying them satisfies it. */
export interface PasswordHolder {
    email?: string;
    userAuthProfiles?: Array<{ provider?: string, password?: string }>;
}

export function hashPassword(
    plainPassword: string,
    salt: string,
    algorithm: "sha256" = "sha256"
): string {
    return crypto.createHash(algorithm).update(plainPassword + salt).digest("hex");
}

export function verifyPassword(
    user: PasswordHolder,
    plainPassword: string,
): boolean {
    if(!user.email || !user.userAuthProfiles) {
        return false;
    }

    const hashedPassword = user.userAuthProfiles.find(profile => profile.provider === "local")?.password;
    if(!hashedPassword) {
        return false;
    }

    return hashPassword(plainPassword, user.email) === hashedPassword;
}

export default {
    hashPassword,
    verifyPassword
};
