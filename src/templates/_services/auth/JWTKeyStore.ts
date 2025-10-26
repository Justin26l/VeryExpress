// {{headerComment}}
import dotenv from "dotenv";
import { Algorithm } from "jsonwebtoken";

dotenv.config();

export interface keyObj {
    key: string, 
    index?: number, 
    clientIndex?:string, 
}

export class JWTKeyStore{
    readonly algorithm: Algorithm = this.getAlgorithm(process.env.JWT_ALGORITHM);
    readonly expireTime: string | undefined = process.env.JWT_EXPIRE_TIME || "1h";
    private secrets: string[] = [];

    constructor(){
        this.secrets = [
            process.env.JWT_SECRET0 || "",
            process.env.JWT_SECRET1 || "",
            process.env.JWT_SECRET2 || "",
            process.env.JWT_SECRET3 || "",
            process.env.JWT_SECRET4 || "",
            process.env.JWT_SECRET5 || "",
            process.env.JWT_SECRET6 || "",
            process.env.JWT_SECRET7 || "",
            process.env.JWT_SECRET8 || "",
            process.env.JWT_SECRET9 || "",
        ].filter((key) => key !== "");
    }

    /**
     * @return {number} 
     * - key
     * - index (actual index of key)
     * - client index (index with random string)
     */
    public getRandomKey(): keyObj {
        // get leng of secrets and return random key
        const len = this.secrets.length;
        const tokenInfo = {
            index: 0,
            clientIndex: "",
            key: ""
        };
        if (len > 1) {
            tokenInfo.index = Math.floor(Math.random() * len);
        }

        tokenInfo.clientIndex = this.getRandomCharString() + tokenInfo.index;
        tokenInfo.key = this.secrets[tokenInfo.index];

        return tokenInfo;
    }

    /**
     * retrive key by index or client index
     */
    public getSecret(index:number|string): string {
        if (typeof index === "string") {
            index = parseInt(index.replace(/\D/g, ""));
        }

        return this.secrets[index];
    }

    /**
     * retrive key by index or client index
     */
    public getSecretObj(index:number|string): keyObj {
        if (typeof index === "string") {
            index = parseInt(index.replace(/\D/g, ""));
        }

        return {
            key: this.secrets[index]
        };
    }

    private getRandomCharString(length: number = 3): string {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        let result = "";
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters[randomIndex];
        }
        return result;
    }

    /**
     * Type guard to check if a string is a valid Algorithm.
     * @param str - The string to check.
     * @returns True if the string is a valid Algorithm, false otherwise.
     */
    private getAlgorithm(str: string | undefined): Algorithm {
        const algorithms: Algorithm[] = [
            "HS256", "HS384", "HS512",
            "RS256", "RS384", "RS512",
            "ES256", "ES384", "ES512",
            "PS256", "PS384", "PS512",
            "none"
        ];

        if ( algorithms.includes(str as Algorithm) ) {
            return str as Algorithm;
        }
        else {
            return "HS256";
        }
    }
}

export default JWTKeyStore;