// Token Lifecycle & Cryptographic Signing Service
import jwt from 'jsonwebtoken';
import { authConfig } from '../../config/auth.config.js';
import { InvalidTokenError } from '../../shared/errors.js';

export class TokenService {
    /**
     * Generate Access Token (15m expiry)
     */
    static generateAccessToken(payload) {
        return jwt.sign(
            {
                sub: payload.userId,
                outletId: payload.outletId,
                username: payload.username,
                roles: payload.roles || [],
                permissions: payload.permissions || []
            },
            authConfig.jwt.accessSecret,
            { expiresIn: authConfig.jwt.accessExpiresIn }
        );
    }

    /**
     * Generate Refresh Token (7d expiry)
     */
    static generateRefreshToken(payload, familyId) {
        return jwt.sign(
            {
                sub: payload.userId,
                outletId: payload.outletId,
                familyId: familyId
            },
            authConfig.jwt.refreshSecret,
            { expiresIn: `${authConfig.jwt.refreshExpiresInDays}d` }
        );
    }

    /**
     * Generate short-lived Manager Override Token (120s expiry)
     * Issued after a verified Manager PIN entry
     */
    static generateManagerOverrideToken(payload) {
        return jwt.sign(
            {
                managerId: payload.managerId,
                managerUsername: payload.managerUsername,
                outletId: payload.outletId,
                action: payload.action,
                targetEntityId: payload.targetEntityId || null
            },
            authConfig.jwt.overrideSecret,
            { expiresIn: `${authConfig.jwt.overrideExpiresInSeconds}s` }
        );
    }

    /**
     * Verify and decode Access Token
     */
    static verifyAccessToken(token) {
        try {
            return jwt.verify(token, authConfig.jwt.accessSecret);
        } catch (err) {
            throw new InvalidTokenError(err.message === 'jwt expired' ? 'Access token expired' : 'Invalid access token');
        }
    }

    /**
     * Verify and decode Refresh Token
     */
    static verifyRefreshToken(token) {
        try {
            return jwt.verify(token, authConfig.jwt.refreshSecret);
        } catch (err) {
            throw new InvalidTokenError(err.message === 'jwt expired' ? 'Refresh token expired' : 'Invalid refresh token');
        }
    }

    /**
     * Verify and decode Manager Override Token
     */
    static verifyManagerOverrideToken(token) {
        try {
            return jwt.verify(token, authConfig.jwt.overrideSecret);
        } catch (err) {
            throw new InvalidTokenError(err.message === 'jwt expired' ? 'Manager override token expired' : 'Invalid manager override token');
        }
    }
}
