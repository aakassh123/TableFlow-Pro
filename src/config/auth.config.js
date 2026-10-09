// Authentication & Security Configuration
import crypto from 'crypto';

export const authConfig = {
    jwt: {
        // In production, loaded from environment variables
        accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-super-secure-access-secret-32-chars-min!!',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-super-secure-refresh-secret-32-chars-min!!',
        overrideSecret: process.env.JWT_OVERRIDE_SECRET || 'dev-super-secure-override-secret-32-chars!!',
        accessExpiresIn: '15m', // 15 minutes access token lifetime
        refreshExpiresInDays: 7, // 7 days refresh token lifetime
        overrideExpiresInSeconds: 120 // 2 minutes manager PIN override token lifetime
    },
    bcrypt: {
        saltRounds: 10
    },
    hashing: {
        // Fast SHA-256 hash for database token lookup
        hashToken: (token) => crypto.createHash('sha256').update(token).digest('hex')
    }
};
