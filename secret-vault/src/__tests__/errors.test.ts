import { describe, expect, it } from "vitest";
import {
  AccessDeniedError,
  EncryptionError,
  MaintenanceError,
  NotFoundError,
  ReadOnlyError,
  ValidationError,
  VaultError,
} from "../errors.js";

describe("VaultError hierarchy", () => {
  it("VaultError has code and status", () => {
    const err = new VaultError("test", "TEST_CODE", 418);
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
    expect(err.status).toBe(418);
    expect(err.name).toBe("VaultError");
    expect(err).toBeInstanceOf(Error);
  });

  it("VaultError defaults status to 500", () => {
    const err = new VaultError("test", "TEST_CODE");
    expect(err.status).toBe(500);
  });

  it("NotFoundError has correct code and status", () => {
    const err = new NotFoundError("not here");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(VaultError);
  });

  it("AccessDeniedError has correct code and status", () => {
    const err = new AccessDeniedError("denied");
    expect(err.code).toBe("ACCESS_DENIED");
    expect(err.status).toBe(403);
    expect(err).toBeInstanceOf(VaultError);
  });

  it("ValidationError has correct code and status", () => {
    const err = new ValidationError("bad input");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(err).toBeInstanceOf(VaultError);
  });

  it("EncryptionError has correct code and status", () => {
    const err = new EncryptionError("decrypt failed");
    expect(err.code).toBe("ENCRYPTION_ERROR");
    expect(err.status).toBe(500);
    expect(err).toBeInstanceOf(VaultError);
  });

  it("MaintenanceError has correct code and status", () => {
    const err = new MaintenanceError();
    expect(err.code).toBe("MAINTENANCE");
    expect(err.status).toBe(503);
  });

  it("ReadOnlyError has correct code and status", () => {
    const err = new ReadOnlyError();
    expect(err.code).toBe("READ_ONLY");
    expect(err.status).toBe(503);
  });
});
