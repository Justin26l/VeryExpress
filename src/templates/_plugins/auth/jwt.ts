// {{headerComment}}

import jwt from "jsonwebtoken";
import JWTKeyStore from "./JWTKeyStore.gen";

const keys = new JWTKeyStore();

export function generateToken(
    data: any, 
    keyIndex?: number,
    expiresIn?: string
): { 
    token: string, 
    index?: number, 
    clientIndex?: string 
} {
    const keyInfo = typeof keyIndex == "number" ? keys.getKeyObj(keyIndex) : keys.getRandomKey();

    const token = jwt.sign(
        data,
        keyInfo.key,
        {
            expiresIn: expiresIn || keys.expireTime || "1h",
        }
    );

    return {
        token: token,
        index: keyInfo.index,
        clientIndex: keyInfo.clientIndex
    };
}

/**
 * Verifies a JSON Web Token (JWT) using the provided token and key index.
 *
 * @param {string} token - The JSON Web Token to be verified.
 * @param {number} index - The index of the key used to verify the token.
 * @return {jwt.JwtPayload | string | false} The decoded token payload, an error message, or false if verification fails.
 */
export function verifyToken(token: string, index?: number|string): jwt.JwtPayload | string |  false {
    try {
        if(!index) {
            return false;
        }
        const key = keys.getKey(index);
        return jwt.verify(token, key);
    } catch (error) {
        if(
            error instanceof jwt.TokenExpiredError || 
            error instanceof jwt.JsonWebTokenError 
        ) {
            throw error;
        }
        else {
            return false;
        }
    }
}
