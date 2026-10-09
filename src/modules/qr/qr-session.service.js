// Cryptographically Signed, Short-Lived Table QR Session Service
// Prevents unauthorized remote ordering, table hijacking, and prank abuse
import crypto from 'crypto';
import { AppError, ValidationError } from '../../shared/errors.js';

const QR_SESSION_SECRET = process.env.QR_SESSION_SECRET || 'rop-signed-table-qr-session-secret-20261007-WA0006!!';
const DEFAULT_SESSION_TTL_MINUTES = 120; // 2 hours

/**
 * Normalizes table representations (e.g. 'T-07', '07', '7', 'Table-7' -> '7')
 */
export function normalizeTableIdentifier(identifier) {
    if (!identifier) return '';
    const cleaned = String(identifier).trim().toUpperCase().replace(/^TABLE[-_\s]*/, '').replace(/^T[-_\s]*/, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? cleaned : String(num);
}

export class QRSessionService {
    /**
     * Resolves a table record from DB flexibly handling formats like '7', '07', 'T-07'
     */
    static async resolveTable(db, {
        outletId = '33333333-3333-3333-3333-333333333301',
        tableIdentifier
    }) {
        if (!tableIdentifier) {
            throw new ValidationError('Table identifier is required');
        }

        const raw = String(tableIdentifier).trim();
        const normalized = normalizeTableIdentifier(raw);
        const paddedNum = normalized.padStart(2, '0'); // e.g. '07'

        // 1. Direct and variant matches
        const res = await db.query(`
            SELECT id, outlet_id, table_number, section, capacity, status, qr_code_token, is_active
            FROM tables
            WHERE outlet_id = $1
              AND (
                UPPER(table_number) = UPPER($2)
                OR UPPER(table_number) = UPPER($3)
                OR UPPER(table_number) = UPPER($4)
                OR UPPER(table_number) = UPPER($5)
              )
            LIMIT 1
        `, [
            outletId,
            raw,
            `T-${paddedNum}`,      // 'T-07'
            `T-${normalized}`,     // 'T-7'
            `TABLE ${paddedNum}`   // 'TABLE 07'
        ]);

        if (res.rows.length === 0) {
            throw new AppError(`Table '${tableIdentifier}' not found for outlet`, 404, 'TABLE_NOT_FOUND');
        }

        return res.rows[0];
    }

    /**
     * Generate a signed, short-lived session token for a specific table
     */
    static generateSessionToken({
        outletId,
        tableId,
        tableNumber,
        expiresInMinutes = DEFAULT_SESSION_TTL_MINUTES
    }) {
        if (!outletId) throw new ValidationError('Outlet ID is required');
        if (!tableId) throw new ValidationError('Table ID is required');
        if (!tableNumber) throw new ValidationError('Table number is required');

        const now = Date.now();
        const exp = now + (expiresInMinutes * 60 * 1000);
        const nonce = crypto.randomBytes(8).toString('hex');

        const payload = {
            outletId,
            tableId,
            tableNumber: String(tableNumber),
            normalizedTable: normalizeTableIdentifier(tableNumber),
            nonce,
            iat: now,
            exp
        };

        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signatureB64 = crypto
            .createHmac('sha256', QR_SESSION_SECRET)
            .update(payloadB64)
            .digest('base64url');

        const token = `${payloadB64}.${signatureB64}`;

        // Customer friendly URL parameter (e.g. /table/7/session/xxxx or /table/07/session/xxxx)
        const displayTableParam = normalizeTableIdentifier(tableNumber);
        const sessionUrl = `/table/${displayTableParam}/session/${token}`;

        return {
            token,
            outletId,
            tableId,
            tableNumber: String(tableNumber),
            displayTableParam,
            sessionUrl,
            issuedAt: new Date(now).toISOString(),
            expiresAt: new Date(exp).toISOString(),
            expiresInMinutes
        };
    }

    /**
     * Verifies cryptographic signature, expiration, and table binding
     */
    static verifySessionToken(token, {
        expectedTableIdentifier = null,
        expectedTableId = null,
        expectedOutletId = null
    } = {}) {
        if (!token || typeof token !== 'string') {
            throw new AppError('QR session token is missing', 401, 'QR_SESSION_MISSING');
        }

        const parts = token.split('.');
        if (parts.length !== 2) {
            throw new AppError('Malformed QR session token format', 400, 'QR_MALFORMED_TOKEN');
        }

        const [payloadB64, signatureB64] = parts;

        // Verify cryptographic HMAC-SHA256 signature
        const expectedSignatureB64 = crypto
            .createHmac('sha256', QR_SESSION_SECRET)
            .update(payloadB64)
            .digest('base64url');

        const sigA = Buffer.from(signatureB64);
        const sigB = Buffer.from(expectedSignatureB64);

        if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
            throw new AppError(
                'Invalid or tampered QR session signature. Access denied.',
                403,
                'QR_SIGNATURE_INVALID'
            );
        }

        // Parse payload
        let payload;
        try {
            payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
        } catch (e) {
            throw new AppError('Invalid QR session token payload', 400, 'QR_INVALID_PAYLOAD');
        }

        const now = Date.now();

        // Check expiration
        if (now > payload.exp) {
            throw new AppError(
                `QR session expired at ${new Date(payload.exp).toLocaleTimeString()}. Please scan the table QR code again.`,
                401,
                'QR_SESSION_EXPIRED',
                { expiredAt: new Date(payload.exp).toISOString() }
            );
        }

        // Check Table Binding (prevents URL parameter tampering e.g. changing /table/3 to /table/7)
        if (expectedTableIdentifier) {
            const expNorm = normalizeTableIdentifier(expectedTableIdentifier);
            const tokenNorm = payload.normalizedTable || normalizeTableIdentifier(payload.tableNumber);

            if (expNorm !== tokenNorm) {
                throw new AppError(
                    `Session token belongs to Table '${payload.tableNumber}', but request targeted Table '${expectedTableIdentifier}'. Cross-table access denied.`,
                    403,
                    'QR_TABLE_MISMATCH',
                    { tokenTable: payload.tableNumber, requestedTable: expectedTableIdentifier }
                );
            }
        }

        // Check Table ID binding
        if (expectedTableId && payload.tableId !== expectedTableId) {
            throw new AppError(
                'Session token table ID does not match resolved table',
                403,
                'QR_TABLE_MISMATCH'
            );
        }

        // Check Outlet binding
        if (expectedOutletId && payload.outletId !== expectedOutletId) {
            throw new AppError(
                'Session token does not belong to this outlet',
                403,
                'QR_OUTLET_MISMATCH'
            );
        }

        return {
            valid: true,
            payload,
            remainingMinutes: Math.max(0, Math.round((payload.exp - now) / 60000))
        };
    }
}
