import dotenv from "dotenv";
dotenv.config();

export class JWTKeyStore{
    readonly expireTime: string | undefined = process.env.JWT_EXPIRE_TIME;
    private keys: string[] = [];

    constructor(){
        this.keys = [
            process.env.JWT_KEY0 || undefined,
            process.env.JWT_KEY1 || undefined,
            process.env.JWT_KEY2 || undefined,
            process.env.JWT_KEY3 || undefined,
            process.env.JWT_KEY4 || undefined,
            process.env.JWT_KEY5 || undefined,
            process.env.JWT_KEY6 || undefined,
            process.env.JWT_KEY7 || undefined,
            process.env.JWT_KEY8 || undefined,
            process.env.JWT_KEY9 || undefined,
        ].filter((key) => key !== undefined);
    }

    /**
     * @return {number} 
     * - key
     * - index (actual index of key)
     * - client index (index with random string)
     */
    public getRandomKey(): { index: number, clientIndex:string, key: string } {
        // get leng of keys and return random key
        const len = this.keys.length;
        const tokenInfo = {
            index: 0,
            clientIndex: '',
            key: ''
        }
        if (len > 1) {
            tokenInfo.index = Math.floor(Math.random() * len);
        }

        tokenInfo.clientIndex = this.getRandomCharString() + tokenInfo.index;
        tokenInfo.key = this.keys[tokenInfo.index];

        return tokenInfo;
    }

    /**
     * retrive key by index or client index
     */
    public getKey(index:number|string): string {
        if (typeof index === "string") {
            index = parseInt(index.replace(/\D/g, ""));
        }

        return this.keys[index];
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
}

export default JWTKeyStore;