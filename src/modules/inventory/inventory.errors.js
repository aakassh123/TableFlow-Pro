// Inventory Domain Errors
import { AppError } from '../../shared/errors.js';

export class InsufficientStockError extends AppError {
    constructor(stockItemId, requested, available, message = null) {
        super(
            message || `Insufficient available stock for item ${stockItemId}: requested ${requested}, available ${available}`,
            409,
            'INSUFFICIENT_STOCK',
            { stockItemId, requested, available }
        );
    }
}

export class InvalidReservationStateError extends AppError {
    constructor(reservationId, currentStatus, expectedStatus = 'PENDING') {
        super(
            `Reservation ${reservationId} is in state '${currentStatus}', but expected '${expectedStatus}'`,
            409,
            'INVALID_RESERVATION_STATE',
            { reservationId, currentStatus, expectedStatus }
        );
    }
}

export class ReservationNotFoundError extends AppError {
    constructor(reservationId) {
        super(`Stock reservation ${reservationId} not found`, 404, 'RESERVATION_NOT_FOUND', { reservationId });
    }
}

export class StockItemNotFoundError extends AppError {
    constructor(stockItemId) {
        super(`Stock item ${stockItemId} not found`, 404, 'STOCK_ITEM_NOT_FOUND', { stockItemId });
    }
}
