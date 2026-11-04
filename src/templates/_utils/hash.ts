// {{headerComment}}
import crypto from "crypto";
import { UserWithRelations } from "../_types/User.gen";

export function hashPassword(
    plainPassword: string,
    salt: string,
    algorithm: "sha256" = "sha256"
): string {
    return crypto.createHash(algorithm).update(plainPassword + salt).digest("hex");
}

export function verifyPassword(
    user: UserWithRelations,
    plainPassword: string,
): boolean {
    if(!user.email || !user.userAuthProfiles) {
        return false;
    }

    const hashedPassword = user.userAuthProfiles.find((profile:any) => profile.provider === "local")?.password;
    if(!hashedPassword) {
        return false;
    }

    return hashPassword(plainPassword, user.email) === hashedPassword;
}

export default {
    hashPassword,
    verifyPassword
};