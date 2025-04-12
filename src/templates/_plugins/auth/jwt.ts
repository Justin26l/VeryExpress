// {{headerComment}}

import jwt from "jsonwebtoken";
import JWTKeyStore from "./JWTKeyStore.gen";
import responseCode from "../../_types/response/responseCode.gen";
import { UserModel } from "../../_models/UserModel.gen";
import { sanitizeUser } from "../../_plugins/auth/token.gen";
import { VexResponseError } from "../../_utils/response.gen";

interface tokenObj { 
    token: string, 
    index?: number, 
    clientIndex?: string 
}

const keys = new JWTKeyStore();

export function generateToken(
    data: any, 
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

export async function generateAccessToken(userId: string, index?: number): Promise<tokenObj> {

    const userDoc = await UserModel.findById(userId).exec();
    if (!userDoc) {
        throw new VexResponseError(404, responseCode.err_payload, "Invalid User Id");
    }
    const userInfo = sanitizeUser(userDoc);

    return generateToken(userInfo, index, process.env.ACCESS_TOKEN_EXPIRE_TIME);
}

export function generateRefreshToken(data: any, index?: number): tokenObj {
    return generateToken(data, index, process.env.REFRESH_TOKEN_EXPIRE_TIME);
}

/**
 * Verifies a JSON Web Token (JWT) using the provided token and key index.
 *
 * @param {string} token - The JSON Web Token to be verified.
 * @param {number} index - The index of the key used to verify the token.
 * @return {jwt.JwtPayload } The decoded token payload, an error message, or false if verification fails.
 */
export function verifyToken(token: string, index?: number|string): jwt.JwtPayload {

    if(token.startsWith("Bearer ")) {
        token = token.split("Bearer ")[1]; 
    }

    const key = keys.getKey(index || 0);

    try{
        return jwt.verify(token, key) as jwt.JwtPayload;
    }
    catch (error){
        if(error instanceof jwt.TokenExpiredError) {
            throw new VexResponseError(401, responseCode.err_payload, "Token expired");
        }
        else if(error instanceof jwt.JsonWebTokenError) {
            throw new VexResponseError(401, responseCode.err_payload, "jwt malformed");
        }
        else{
            throw error;
        }
    }
}