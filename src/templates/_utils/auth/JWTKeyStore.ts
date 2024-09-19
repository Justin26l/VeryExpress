export class JWTKeyStore{
    private keys: string[] = [];
    constructor(){
        this.keys = [
            process.env.AUTH_KEY0 || undefined,
            process.env.AUTH_KEY1 || undefined,
            process.env.AUTH_KEY2 || undefined,
            process.env.AUTH_KEY3 || undefined,
            process.env.AUTH_KEY4 || undefined,
            process.env.AUTH_KEY5 || undefined,
            process.env.AUTH_KEY6 || undefined,
            process.env.AUTH_KEY7 || undefined,
            process.env.AUTH_KEY8 || undefined,
            process.env.AUTH_KEY9 || undefined,
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
        const index = Math.floor(Math.random() * len);
        // get random char string
        const clientIndex = this.getRandomCharString() + index;

        return {
            index,
            clientIndex,
            key: this.keys[index]
        };
    }

    /**
     * return key by index
    */
    public getKey(index:number|string): string {
        if (typeof index === 'string') {
            index = parseInt(index.replace(/\D/g, ''));
        }

        return this.keys[index];
    }

    private getRandomCharString(length: number = 3): string {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let result = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters[randomIndex];
        }
        return result;
    }
}

export default JWTKeyStore;