// {{headerComment}}

import jwt from "jsonwebtoken";
import JWTKeyStore from "./JWTKeyStore.gen";

interface tokenObj { 
    token: string, 
    index?: number, 
    clientIndex?: string 
};

const keys = new JWTKeyStore();

export function generateToken(
    data: Object, 
    index?: number,
    expiresIn?: string
): tokenObj {
    data = JSON.parse(JSON.stringify(data));
    const keyInfo = typeof index == "number" ? keys.getKeyObj(index) : keys.getRandomKey();
    const token = jwt.sign(
        data,
        keyInfo.key,
        {
            expiresIn: expiresIn || keys.expireTime || "1h",
            algorithm: keys.algorithm
        }
    );

    return {
        token: token,
        index: keyInfo.index,
        clientIndex: keyInfo.clientIndex
    };
}

export function generateAccessToken(data: Object, index?: number): tokenObj {
    return generateToken(data, index, process.env.ACCESS_TOKEN_EXPIRE_TIME);
}

export function generateRefreshToken(data: Object, index?: number): tokenObj {
    return generateToken(data, index, process.env.REFRESH_TOKEN_EXPIRE_TIME);
}

/**
 * Verifies a JSON Web Token (JWT) using the provided token and key index.
 *
 * @param {string} token - The JSON Web Token to be verified.
 * @param {number} index - The index of the key used to verify the token.
 * @return {jwt.JwtPayload | string | false} The decoded token payload, an error message, or false if verification fails.
 */
export function verifyToken(token: string, index?: number|string): jwt.JwtPayload | false {
    try {
        const key = keys.getKey(index || 0);
        return jwt.verify(token, key) as jwt.JwtPayload;
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