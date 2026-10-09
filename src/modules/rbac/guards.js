// RBAC Security Middleware & Guards
import { TokenService } from '../auth/token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UnauthorizedError, ForbiddenError, ManagerOverrideRequiredError } from '../../shared/errors.js';
import { ROLES, SENSITIVE_ACTIONS } from './permissions.js';

/**
 * Authentication Guard: Extracts Bearer JWT, validates signature, and decorates req.user
 */
export function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new UnauthorizedError('Missing or malformed Authorization header'));
    }

    const token = authHeader.substring(7);
    try {
        const decoded = TokenService.verifyAccessToken(token);
        req.user = {
            id: decoded.sub,
            outletId: decoded.outletId,
            username: decoded.username,
            roles: decoded.roles || [],
            permissions: decoded.permissions || []
        };
        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Permission Guard: Strict backend authorization enforcement
 * "Do not rely only on frontend route protection. Every backend operation must enforce permissions."
 *
 * For sensitive operations (orders.discount, orders.cancel, orders.refund, inventory.adjust, payments.refund):
 * - If the user is OWNER or MANAGER, innate managerial authority is granted.
 * - If the user is CASHIER/WAITER without the standalone permission, a verified Manager Override Token
 *   (signed upon entering the Manager PIN) authorizes the request.
 */
export function requirePermission(permissionCode, allowManagerOverride = false) {
    const isSensitive = SENSITIVE_ACTIONS.has(permissionCode) || allowManagerOverride;

    return (req, res, next) => {
        if (!req.user) {
            return next(new UnauthorizedError('Authentication context required'));
        }

        // 1. OWNER or MANAGER role has innate authorization across operations
        if (req.user.roles.includes(ROLES.OWNER) || req.user.roles.includes(ROLES.MANAGER)) {
            req.managerOverride = {
                managerId: req.user.id,
                managerUsername: req.user.username,
                innateAuthority: true
            };
            return next();
        }

        // 2. Check if user possesses explicit permission directly
        const hasExplicitPerm = req.user.permissions && req.user.permissions.includes(permissionCode);

        // If not sensitive and has permission, grant
        if (!isSensitive && hasExplicitPerm) {
            return next();
        }

        // 3. For sensitive operations, staff MUST provide a Manager PIN override token
        if (isSensitive) {
            const overrideToken = req.headers['x-manager-override-token'];
            if (!overrideToken) {
                return next(new ManagerOverrideRequiredError(
                    permissionCode,
                    `Sensitive operation '${permissionCode}' requires a Manager PIN authorization token.`
                ));
            }

            try {
                const decoded = TokenService.verifyManagerOverrideToken(overrideToken);

                if (decoded.action !== permissionCode) {
                    return next(new ForbiddenError(
                        `Override token was issued for action '${decoded.action}', but required '${permissionCode}'`
                    ));
                }

                if (decoded.outletId !== req.user.outletId) {
                    return next(new ForbiddenError('Override token does not match current outlet'));
                }

                req.managerOverride = {
                    managerId: decoded.managerId,
                    managerUsername: decoded.managerUsername,
                    innateAuthority: false
                };

                return next();
            } catch (err) {
                return next(err);
            }
        }

        return next(new ForbiddenError(`Forbidden: User does not possess permission '${permissionCode}'`));
    };
}

/**
 * Separate Manager Override Guard for explicit chaining
 */
export function requireManagerOverride(sensitiveAction) {
    return requirePermission(sensitiveAction, true);
}
