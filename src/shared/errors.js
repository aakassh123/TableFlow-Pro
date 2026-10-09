// Domain & Security Errors adhering to RFC 7807 (Problem Details)

export class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required', code = 'UNAUTHORIZED', details = null) {
        super(message, 401, code, details);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Insufficient permissions', code = 'FORBIDDEN', details = null) {
        super(message, 403, code, details);
    }
}

export class InvalidTokenError extends UnauthorizedError {
    constructor(message = 'Invalid or expired token', code = 'INVALID_TOKEN') {
        super(message, code);
    }
}

export class ManagerOverrideRequiredError extends ForbiddenError {
    constructor(action, message = null) {
        super(
            message || `Manager authorization PIN required for sensitive action: ${action}`,
            'MANAGER_OVERRIDE_REQUIRED',
            { action }
        );
    }
}

export class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}
