// {{headerComment}}
import jwt from "jsonwebtoken";
import ms from "ms";
import path from "path";
// import express, { CookieOptions } from "express";

import JWTKeyStore from "./JWTKeyStore.gen";

import { VexRepository, VexResErr } from "../../_types/vex";

import VexDb from "../VexDb.gen";
import { UserEntity, UserWithRelations } from "../../_models/UserModel.gen";
import { SessionEntity, Session } from "../../_models/SessionModel.gen";

interface tokenObj {
    token: string,
    index?: number,
    clientIndex?: string
}

export default class JWTService {
    private keyStore = new JWTKeyStore();

    private get userRepo(): VexRepository<UserWithRelations> {
        return VexDb.getRepository<UserWithRelations>(UserEntity);
    }
    private get sessionRepo(): VexRepository<Session> {
        return VexDb.getRepository<Session>(SessionEntity);
    }

    constructor() {}

    /**
     * Verifies a JSON Web Token (JWT) using the provided token and key index.
     *
     * @param {string} token - The JSON Web Token to be verified.
     * @param {number} index - The index of the key used to verify the token.
     * @return {jwt.JwtPayload } The decoded token payload, an error message, or false if verification fails.
     */
    public verifyToken(token: string, index?: number | string): jwt.JwtPayload {

        if (token.startsWith("Bearer ")) {
            token = token.split("Bearer ")[1];
        }

        const key = this.keyStore.getSecret(index || 0);

        try {
            return jwt.verify(token, key) as jwt.JwtPayload;
        }
        catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new VexResErr(401, null, "Token expired");
            }
            else if (error instanceof jwt.JsonWebTokenError) {
                throw new VexResErr(401, null, "jwt malformed");
            }
            else {
                throw error;
            }
        }
    }

    /**
     * Process of login user, assign tokens and create session.
     */
    public async assignTokens(user: UserWithRelations, provider: string): Promise<string> {
        if(!user._id) {
            throw new VexResErr(500, null, "User Data Error, User._id missing.");
        }

        const sessionCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        // insert new unique session for user
        await this.sessionRepo.deleteWhere({ userId: user._id });
        await this.sessionRepo.create({
            sessionCode,
            userId: user._id,
            provider: provider,
            expired: Date.now() + 5000,
        });

        // return appAuthCode to client
        const redirectPath = `${path.posix.join("/", process.env.LOGIN_SUCCESS_REDIRECT_PATH || "/logincallback")}?code=${sessionCode}`;
        
        return redirectPath;
    }

    public returnToken(userProfile: UserWithRelations) {
        const sanitizedProfile = this.sanitizeUser(userProfile);
        const accessToken = this.generateToken(sanitizedProfile, undefined, process.env.ACCESS_TOKEN_EXPIRE_TIME);
        const refreshToken = this.generateToken({ _id: userProfile._id }, 0, process.env.REFRESH_TOKEN_EXPIRE_TIME);

        return {
            profile: sanitizedProfile,
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.index,
            clientIndex: accessToken.clientIndex,
            refreshToken: refreshToken.token
        };
    }

    /** utils */

    public sanitizeUser(user: UserWithRelations) {
        return {
            _id: user._id,
            email: user.email,
            name: user.name,
            locale: user.locale,
            roles: user.userRole?.map((r: any) => r.role) || [],
            profileErrors: user.profileErrors,
            active: user.active
        };
    }

    private generateToken(
        data: any,
        index?: number,
        expiresIn?: string
    ): tokenObj {
        data = JSON.parse(JSON.stringify(data));
        const keyInfo = typeof index == "number" ? this.keyStore.getSecretObj(index) : this.keyStore.getRandomKey();
        const token = jwt.sign(
            data,
            keyInfo.key as jwt.Secret,
            {
                expiresIn: (expiresIn || this.keyStore.expireTime || "1h") as ms.StringValue,
                algorithm: this.keyStore.algorithm
            }
        );

        return {
            token: token,
            index: keyInfo.index,
            clientIndex: keyInfo.clientIndex
        };
    }

    public async generateAccessToken(user: UserWithRelations, index?: number): Promise<tokenObj> {

        const userInfo = this.sanitizeUser(user);

        return this.generateToken(userInfo, index, process.env.ACCESS_TOKEN_EXPIRE_TIME);
    }

    public generateRefreshToken(data: any, index?: number): tokenObj {
        return this.generateToken(data, index, process.env.REFRESH_TOKEN_EXPIRE_TIME);
    }

}