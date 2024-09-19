import jwt from 'jsonwebtoken';
import JWTKeyStore from './JWTKeyStore';

const keys = new JWTKeyStore();

export function generateToken(data: any, expiresIn: string = '1h'): { token: string, index: number, clientIndex: string } {
    const keyInfo = keys.getRandomKey();
    const token = jwt.sign(data, keyInfo.key, { expiresIn: expiresIn });

    return {
        token: token,
        index: keyInfo.index,
        clientIndex: keyInfo.clientIndex
    }
}

export function verifyToken(token: string, index: number): any {
    const key = keys.getKey(index);
    return jwt.verify(token, key);
}