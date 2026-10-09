// Core Authentication Service
import { CryptoService } from '../../shared/crypto.js';
import { TokenService } from './token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UnauthorizedError, ValidationError, ForbiddenError } from '../../shared/errors.js';
import { ROLES } from '../rbac/permissions.js';

export class AuthService {
    /**
     * Retrieve user roles and all associated permissions from database
     */
    static async fetchUserRolesAndPermissions(dbClient, userId) {
        const rolesRes = await dbClient.query(`
            SELECT r.id, r.name 
            FROM roles r
            JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = $1
        `, [userId]);

        const roleNames = rolesRes.rows.map(r => r.name);

        const permRes = await dbClient.query(`
            SELECT DISTINCT p.code
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = $1
        `, [userId]);

        const permissions = permRes.rows.map(p => p.code);

        return { roles: roleNames, permissions };
    }

    /**
     * Standard Login via Username/Email and Password
     */
    static async loginWithPassword(dbClient, { outletId, identifier, password, userAgent = null, ipAddress = null }) {
        if (!identifier || !password) {
            throw new ValidationError('Username/Email and password are required');
        }

        const userRes = await dbClient.query(`
            SELECT id, outlet_id, username, email, phone, full_name, password_hash, is_active
            FROM users
            WHERE (username = $1 OR email = $1 OR phone = $1)
              AND outlet_id = $2
        `, [identifier, outletId]);

        if (userRes.rows.length === 0) {
            throw new UnauthorizedError('Invalid credentials');
        }

        const user = userRes.rows[0];

        if (!user.is_active) {
            throw new UnauthorizedError('User account is deactivated. Contact store manager.');
        }

        const passwordValid = await CryptoService.verifyPassword(password, user.password_hash);
        if (!passwordValid) {
            throw new UnauthorizedError('Invalid credentials');
        }

        // Fetch user roles and permissions
        const { roles, permissions } = await this.fetchUserRolesAndPermissions(dbClient, user.id);

        // Update last login
        await dbClient.query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);

        // Create new token family for session
        const familyId = CryptoService.generateSecureRandomToken(16);
        const accessToken = TokenService.generateAccessToken({
            userId: user.id,
            outletId: user.outlet_id,
            username: user.username,
            roles,
            permissions
        });

        const rawRefreshToken = CryptoService.generateSecureRandomToken(32);
        const refreshTokenJwt = TokenService.generateRefreshToken({
            userId: user.id,
            outletId: user.outlet_id
        }, familyId);

        // Store refresh token in database
        const tokenHash = CryptoService.hashToken(refreshTokenJwt);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await dbClient.query(`
            INSERT INTO refresh_tokens (
                user_id, outlet_id, token_hash, family_id, expires_at, user_agent, ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [user.id, user.outlet_id, tokenHash, familyId, expiresAt, userAgent, ipAddress]);

        // Audit login
        await AuditService.logPrivilegedAction(dbClient, {
            outletId: user.outlet_id,
            userId: user.id,
            action: 'USER_LOGIN_PASSWORD',
            entityName: 'users',
            entityId: user.id,
            newValues: { username: user.username, roles },
            ipAddress,
            userAgent
        });

        return {
            accessToken,
            refreshToken: refreshTokenJwt,
            user: {
                id: user.id,
                outletId: user.outlet_id,
                username: user.username,
                fullName: user.full_name,
                roles,
                permissions
            }
        };
    }

    /**
     * Fast POS Login via 4-digit Staff PIN
     */
    static async loginWithPin(dbClient, { outletId, pin, userAgent = null, ipAddress = null }) {
        if (!pin) {
            throw new ValidationError('Staff PIN is required');
        }

        const usersRes = await dbClient.query(`
            SELECT id, outlet_id, username, full_name, pin_hash, is_active
            FROM users
            WHERE outlet_id = $1 AND pin_hash IS NOT NULL AND is_active = true
        `, [outletId]);

        let matchedUser = null;
        for (const user of usersRes.rows) {
            const isMatch = await CryptoService.verifyPin(pin, user.pin_hash);
            if (isMatch) {
                matchedUser = user;
                break;
            }
        }

        if (!matchedUser) {
            throw new UnauthorizedError('Invalid staff PIN');
        }

        const { roles, permissions } = await this.fetchUserRolesAndPermissions(dbClient, matchedUser.id);

        const familyId = CryptoService.generateSecureRandomToken(16);
        const accessToken = TokenService.generateAccessToken({
            userId: matchedUser.id,
            outletId: matchedUser.outlet_id,
            username: matchedUser.username,
            roles,
            permissions
        });

        const refreshTokenJwt = TokenService.generateRefreshToken({
            userId: matchedUser.id,
            outletId: matchedUser.outlet_id
        }, familyId);

        const tokenHash = CryptoService.hashToken(refreshTokenJwt);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await dbClient.query(`
            INSERT INTO refresh_tokens (
                user_id, outlet_id, token_hash, family_id, expires_at, user_agent, ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [matchedUser.id, matchedUser.outlet_id, tokenHash, familyId, expiresAt, userAgent, ipAddress]);

        await AuditService.logPrivilegedAction(dbClient, {
            outletId: matchedUser.outlet_id,
            userId: matchedUser.id,
            action: 'USER_LOGIN_PIN',
            entityName: 'users',
            entityId: matchedUser.id,
            newValues: { username: matchedUser.username, roles },
            ipAddress,
            userAgent
        });

        return {
            accessToken,
            refreshToken: refreshTokenJwt,
            user: {
                id: matchedUser.id,
                outletId: matchedUser.outlet_id,
                username: matchedUser.username,
                fullName: matchedUser.full_name,
                roles,
                permissions
            }
        };
    }

    /**
     * Refresh Token Rotation with Token Family Reuse & Theft Detection
     */
    static async refreshTokens(dbClient, { refreshToken, userAgent = null, ipAddress = null }) {
        if (!refreshToken) {
            throw new ValidationError('Refresh token is required');
        }

        // 1. Verify token signature and expiry
        const decoded = TokenService.verifyRefreshToken(refreshToken);
        const tokenHash = CryptoService.hashToken(refreshToken);

        // 2. Lookup token in database
        const tokenRes = await dbClient.query(`
            SELECT id, user_id, outlet_id, family_id, is_revoked, expires_at
            FROM refresh_tokens
            WHERE token_hash = $1
        `, [tokenHash]);

        if (tokenRes.rows.length === 0) {
            throw new UnauthorizedError('Unknown or invalid refresh token');
        }

        const storedToken = tokenRes.rows[0];

        // 3. REUSE DETECTION: If already revoked, someone is replaying a stolen token!
        if (storedToken.is_revoked) {
            // Revoke all tokens in this family immediately!
            await dbClient.query(`
                UPDATE refresh_tokens
                SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
                WHERE family_id = $1
            `, [storedToken.family_id]);

            // Audit the security incident
            await AuditService.logPrivilegedAction(dbClient, {
                outletId: storedToken.outlet_id,
                userId: storedToken.user_id,
                action: 'REFRESH_TOKEN_REUSE_DETECTED',
                entityName: 'refresh_tokens',
                entityId: storedToken.id,
                newValues: { security_alert: 'Family revoked due to reuse attempt', familyId: storedToken.family_id },
                ipAddress,
                userAgent
            });

            throw new UnauthorizedError('Security violation: Refresh token reuse detected. All sessions in family revoked.');
        }

        // Check expiration
        if (new Date() > new Date(storedToken.expires_at)) {
            throw new UnauthorizedError('Refresh token expired');
        }

        // Fetch fresh user data and permissions
        const userRes = await dbClient.query(`
            SELECT id, outlet_id, username, is_active FROM users WHERE id = $1
        `, [storedToken.user_id]);

        if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
            throw new UnauthorizedError('User account is invalid or inactive');
        }

        const user = userRes.rows[0];
        const { roles, permissions } = await this.fetchUserRolesAndPermissions(dbClient, user.id);

        // 4. ROTATION: Mark existing token as revoked and replaced
        const newRefreshTokenJwt = TokenService.generateRefreshToken({
            userId: user.id,
            outletId: user.outlet_id
        }, storedToken.family_id);

        const newTokenHash = CryptoService.hashToken(newRefreshTokenJwt);
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Insert new token
        const insertRes = await dbClient.query(`
            INSERT INTO refresh_tokens (
                user_id, outlet_id, token_hash, family_id, expires_at, user_agent, ip_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [user.id, user.outlet_id, newTokenHash, storedToken.family_id, newExpiresAt, userAgent, ipAddress]);

        const newTokenId = insertRes.rows[0].id;

        // Mark old token revoked and reference replacement
        await dbClient.query(`
            UPDATE refresh_tokens
            SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP, replaced_by_token_id = $1
            WHERE id = $2
        `, [newTokenId, storedToken.id]);

        // Issue new access token
        const newAccessToken = TokenService.generateAccessToken({
            userId: user.id,
            outletId: user.outlet_id,
            username: user.username,
            roles,
            permissions
        });

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshTokenJwt
        };
    }

    /**
     * Logout and revoke session
     */
    static async logout(dbClient, { refreshToken }) {
        if (!refreshToken) return;
        const tokenHash = CryptoService.hashToken(refreshToken);
        await dbClient.query(`
            UPDATE refresh_tokens 
            SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
            WHERE token_hash = $1
        `, [tokenHash]);
    }

    /**
     * Verify Manager PIN for Sensitive Operations
     * Issues an ephemeral Manager Override Token valid for 120 seconds
     */
    static async verifyManagerPin(dbClient, { outletId, managerIdentifier, managerPin, sensitiveAction, targetEntityId = null, ipAddress = null, userAgent = null }) {
        if (!managerPin) {
            throw new ValidationError('Manager PIN is required');
        }

        // Query active managers or owners in the outlet
        const managerRes = await dbClient.query(`
            SELECT u.id, u.outlet_id, u.username, u.full_name, u.pin_hash, r.name as role_name
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE u.outlet_id = $1
              AND u.is_active = true
              AND r.name IN ('MANAGER', 'OWNER')
              AND ($2::text IS NULL OR u.username = $2 OR u.email = $2)
        `, [outletId, managerIdentifier || null]);

        if (managerRes.rows.length === 0) {
            throw new ForbiddenError('No authorized manager found in this outlet');
        }

        let verifiedManager = null;
        for (const manager of managerRes.rows) {
            if (manager.pin_hash && (await CryptoService.verifyPin(managerPin, manager.pin_hash))) {
                verifiedManager = manager;
                break;
            }
        }

        if (!verifiedManager) {
            throw new ForbiddenError('Invalid manager authorization PIN');
        }

        // Generate short-lived override token
        const overrideToken = TokenService.generateManagerOverrideToken({
            managerId: verifiedManager.id,
            managerUsername: verifiedManager.username,
            outletId: verifiedManager.outlet_id,
            action: sensitiveAction,
            targetEntityId
        });

        // Audit the manager override grant
        await AuditService.logPrivilegedAction(dbClient, {
            outletId: verifiedManager.outlet_id,
            userId: verifiedManager.id,
            action: 'MANAGER_OVERRIDE_GRANTED',
            entityName: 'manager_overrides',
            entityId: sensitiveAction,
            newValues: {
                manager: verifiedManager.username,
                role: verifiedManager.role_name,
                authorized_action: sensitiveAction,
                target_entity_id: targetEntityId
            },
            ipAddress,
            userAgent
        });

        return {
            overrideToken,
            expiresInSeconds: 120,
            authorizedBy: {
                id: verifiedManager.id,
                username: verifiedManager.username,
                role: verifiedManager.role_name
            }
        };
    }
}
