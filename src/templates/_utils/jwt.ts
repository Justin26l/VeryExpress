import jwt from 'jsonwebtoken';

const secretKey = 'your-secret-key'; // Replace with your secret key

export function generateToken(user: any, expiresIn: string = '1h'): string {
    return jwt.sign(user, secretKey, { expiresIn: expiresIn });
}