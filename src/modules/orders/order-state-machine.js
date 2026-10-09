// Strict Server-Side Order State Machine
import { AppError } from '../../shared/errors.js';

export const ORDER_CHANNELS = {
    WALK_IN: 'WALK_IN',
    DINE_IN: 'DINE_IN',
    QR: 'QR',
    WEBSITE: 'WEBSITE',
    WHATSAPP: 'WHATSAPP',
    DELIVERY: 'DELIVERY'
};

export const ORDER_STATUSES = {
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    PLACED: 'PLACED',
    ACCEPTED: 'ACCEPTED',
    PREPARING: 'PREPARING',
    READY: 'READY',
    SERVED: 'SERVED',
    COLLECTED: 'COLLECTED',
    HANDED_TO_RIDER: 'HANDED_TO_RIDER',
    DELIVERED: 'DELIVERED',
    EXPIRED: 'EXPIRED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    CANCELLED_WITH_WASTE: 'CANCELLED_WITH_WASTE'
};

export class InvalidOrderTransitionError extends AppError {
    constructor(currentStatus, targetStatus, orderId = null, reason = null) {
        super(
            reason || `Illegal order status transition from '${currentStatus}' to '${targetStatus}'${orderId ? ` for order ${orderId}` : ''}`,
            409,
            'INVALID_ORDER_TRANSITION',
            { currentStatus, targetStatus, orderId }
        );
    }
}

export class OrderStateMachine {
    /**
     * Allowed transitions table
     */
    static transitions = {
        [ORDER_STATUSES.PENDING_PAYMENT]: [
            ORDER_STATUSES.PLACED,
            ORDER_STATUSES.EXPIRED,
            ORDER_STATUSES.CANCELLED
        ],
        [ORDER_STATUSES.PLACED]: [
            ORDER_STATUSES.ACCEPTED,
            ORDER_STATUSES.REJECTED,
            ORDER_STATUSES.CANCELLED
        ],
        [ORDER_STATUSES.ACCEPTED]: [
            ORDER_STATUSES.PREPARING,
            ORDER_STATUSES.CANCELLED
        ],
        [ORDER_STATUSES.PREPARING]: [
            ORDER_STATUSES.READY,
            ORDER_STATUSES.CANCELLED_WITH_WASTE
        ],
        [ORDER_STATUSES.READY]: [
            ORDER_STATUSES.SERVED,
            ORDER_STATUSES.COLLECTED,
            ORDER_STATUSES.HANDED_TO_RIDER,
            ORDER_STATUSES.CANCELLED_WITH_WASTE
        ],
        [ORDER_STATUSES.HANDED_TO_RIDER]: [
            ORDER_STATUSES.DELIVERED,
            ORDER_STATUSES.CANCELLED_WITH_WASTE
        ],
        // Terminal states have no outbound transitions
        [ORDER_STATUSES.SERVED]: [],
        [ORDER_STATUSES.COLLECTED]: [],
        [ORDER_STATUSES.DELIVERED]: [],
        [ORDER_STATUSES.EXPIRED]: [],
        [ORDER_STATUSES.REJECTED]: [],
        [ORDER_STATUSES.CANCELLED]: [],
        [ORDER_STATUSES.CANCELLED_WITH_WASTE]: []
    };

    /**
     * Check if transition is valid
     */
    static canTransition(currentStatus, targetStatus, channel = null) {
        const allowed = this.transitions[currentStatus] || [];
        if (!allowed.includes(targetStatus)) {
            return false;
        }

        // Channel-specific terminal fulfillment enforcement from READY state
        if (currentStatus === ORDER_STATUSES.READY) {
            if (targetStatus === ORDER_STATUSES.SERVED) {
                return !channel || channel === ORDER_CHANNELS.DINE_IN || channel === ORDER_CHANNELS.QR;
            }
            if (targetStatus === ORDER_STATUSES.COLLECTED) {
                return !channel || channel === ORDER_CHANNELS.WALK_IN || channel === ORDER_CHANNELS.WEBSITE || channel === ORDER_CHANNELS.WHATSAPP;
            }
            if (targetStatus === ORDER_STATUSES.HANDED_TO_RIDER) {
                return !channel || channel === ORDER_CHANNELS.DELIVERY;
            }
        }

        return true;
    }

    /**
     * Validate transition and throw InvalidOrderTransitionError if illegal
     */
    static validateTransition(currentStatus, targetStatus, channel = null, orderId = null) {
        if (!this.canTransition(currentStatus, targetStatus, channel)) {
            let reason = `Cannot transition order from '${currentStatus}' to '${targetStatus}'`;
            if (currentStatus === ORDER_STATUSES.READY && channel) {
                reason += ` (Fulfillment target '${targetStatus}' is invalid for channel '${channel}')`;
            }
            throw new InvalidOrderTransitionError(currentStatus, targetStatus, orderId, reason);
        }
    }
}
