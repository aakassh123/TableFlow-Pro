// Conflict Queue Service - Zero Silent Data Loss
// Holds conflicting state updates during offline-to-cloud synchronization for manager review
import { AppError, ValidationError } from '../../shared/errors.js';

export const CONFLICT_RESOLUTION_STRATEGIES = {
    KEEP_LOCAL: 'KEEP_LOCAL',       // Edge local ground truth takes precedence
    KEEP_CLOUD: 'KEEP_CLOUD',       // Cloud state preserved
    MERGE: 'MERGE',                 // Custom merged state / Stock ledger variance adjustment
    DISMISSED: 'DISMISSED'
};

export class ConflictQueueService {
    /**
     * Record a sync conflict in the queue
     * Guarantees that neither local nor cloud data is silently lost or overwritten
     */
    static async recordConflict(db, {
        outletId = '33333333-3333-3333-3333-333333333301',
        eventId = null,
        conflictType,
        entityType,
        entityId,
        localState,
        cloudState,
        conflictReason
    }) {
        const res = await db.query(`
            INSERT INTO sync_conflicts (
                outlet_id, event_id, conflict_type, entity_type, entity_id,
                local_state, cloud_state, conflict_reason, resolution_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_REVIEW')
            RETURNING id, outlet_id, conflict_type, entity_type, entity_id,
                      conflict_reason, resolution_status, created_at
        `, [
            outletId,
            eventId,
            conflictType,
            entityType,
            entityId,
            typeof localState === 'string' ? localState : JSON.stringify(localState),
            typeof cloudState === 'string' ? cloudState : JSON.stringify(cloudState),
            conflictReason
        ]);

        // Increment unresolved conflicts counter on edge node
        await db.query(`
            UPDATE edge_node_state
            SET unresolved_conflicts_count = unresolved_conflicts_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE outlet_id = $1
        `, [outletId]);

        return res.rows[0];
    }

    /**
     * List all unresolved sync conflicts awaiting manager review
     */
    static async listPendingConflicts(db, outletId = '33333333-3333-3333-3333-333333333301') {
        const res = await db.query(`
            SELECT id, outlet_id, event_id, conflict_type, entity_type, entity_id,
                   local_state, cloud_state, conflict_reason, resolution_status,
                   created_at
            FROM sync_conflicts
            WHERE outlet_id = $1 AND resolution_status = 'PENDING_REVIEW'
            ORDER BY created_at DESC
        `, [outletId]);

        return res.rows;
    }

    /**
     * Resolve a conflict with chosen strategy and manager notes
     */
    static async resolveConflict(db, {
        conflictId,
        outletId = '33333333-3333-3333-3333-333333333301',
        resolutionStrategy = CONFLICT_RESOLUTION_STRATEGIES.KEEP_LOCAL,
        resolutionNotes = null,
        resolvedBy = null
    }) {
        if (!conflictId) throw new ValidationError('Conflict ID is required');

        const existingRes = await db.query(`
            SELECT id, resolution_status, entity_type, entity_id, local_state, cloud_state
            FROM sync_conflicts
            WHERE id = $1 AND outlet_id = $2
        `, [conflictId, outletId]);

        if (existingRes.rows.length === 0) {
            throw new AppError(`Sync conflict ${conflictId} not found`, 404, 'CONFLICT_NOT_FOUND');
        }

        const conflict = existingRes.rows[0];
        if (conflict.resolution_status !== 'PENDING_REVIEW') {
            return { alreadyResolved: true, conflict };
        }

        const targetStatus = `RESOLVED_${resolutionStrategy}`;

        await db.query(`
            UPDATE sync_conflicts
            SET resolution_status = $1,
                resolution_strategy = $2,
                resolution_notes = $3,
                resolved_by = $4,
                resolved_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [targetStatus, resolutionStrategy, resolutionNotes, resolvedBy, conflictId]);

        // Decrement unresolved conflicts counter
        await db.query(`
            UPDATE edge_node_state
            SET unresolved_conflicts_count = GREATEST(0, unresolved_conflicts_count - 1),
                updated_at = CURRENT_TIMESTAMP
            WHERE outlet_id = $1
        `, [outletId]);

        return {
            success: true,
            conflictId,
            resolutionStatus: targetStatus,
            resolutionStrategy,
            message: `Conflict resolved using strategy ${resolutionStrategy}`
        };
    }
}
