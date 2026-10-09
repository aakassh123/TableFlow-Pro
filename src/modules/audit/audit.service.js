// Immutable Audit Logging Service for Privileged & Sensitive Actions

export class AuditService {
    /**
     * Record a privileged action or sensitive modification into audit_logs
     */
    static async logPrivilegedAction(dbClient, {
        outletId,
        userId,
        action,
        entityName,
        entityId,
        oldValues = null,
        newValues = null,
        managerOverride = null,
        ipAddress = null,
        userAgent = null
    }) {
        const payloadNewValues = {
            ...(newValues || {}),
            ...(managerOverride ? { _manager_authorized_by: managerOverride } : {})
        };

        const query = `
            INSERT INTO audit_logs (
                outlet_id, user_id, action, entity_name, entity_id,
                old_values, new_values, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, created_at;
        `;

        const res = await dbClient.query(query, [
            outletId || null,
            userId || null,
            action,
            entityName,
            String(entityId),
            oldValues ? JSON.stringify(oldValues) : null,
            JSON.stringify(payloadNewValues),
            ipAddress || null,
            userAgent || null
        ]);

        return res.rows[0];
    }
}
