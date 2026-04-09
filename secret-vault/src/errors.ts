export class VaultError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.name = "VaultError";
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends VaultError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
  }
}

export class AccessDeniedError extends VaultError {
  constructor(message: string) {
    super(message, "ACCESS_DENIED", 403);
  }
}

export class ValidationError extends VaultError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class EncryptionError extends VaultError {
  constructor(message: string) {
    super(message, "ENCRYPTION_ERROR", 500);
  }
}

export class MaintenanceError extends VaultError {
  constructor() {
    super("Service is in maintenance mode", "MAINTENANCE", 503);
  }
}

export class ReadOnlyError extends VaultError {
  constructor() {
    super("Service is in read-only mode", "READ_ONLY", 503);
  }
}
