// Cryptographic and Hashing Services
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authConfig } from '../config/auth.config.js';

export class CryptoService {
    /**
     * Hash user password using bcrypt with standard salt rounds
     */
    static async hashPassword(password) {
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }
        return bcrypt.hash(password, authConfig.bcrypt.saltRounds);
    }

    /**
     * Verify user password
     */
    static async verifyPassword(plainPassword, passwordHash) {
        if (!plainPassword || !passwordHash) return false;
        return bcrypt.compare(plainPassword, passwordHash);
    }

    /**
     * Hash staff POS numeric PIN (4-6 digits)
     */
    static async hashPin(pin) {
        if (!pin || pin.length < 4 || pin.length > 8) {
            throw new Error('PIN must be between 4 and 8 digits');
        }
        return bcrypt.hash(pin, authConfig.bcrypt.saltRounds);
    }

    /**
     * Verify staff POS numeric PIN
     */
    static async verifyPin(plainPin, pinHash) {
        if (!plainPin || !pinHash) return false;
        return bcrypt.compare(plainPin, pinHash);
    }

    /**
     * Generate secure random token string
     */
    static generateSecureRandomToken(bytes = 32) {
        return crypto.randomBytes(bytes).toString('hex');
    }

    /**
     * SHA-256 hash for database token lookup index
     */
    static hashToken(token) {
        return authConfig.hashing.hashToken(token);
    }
}
