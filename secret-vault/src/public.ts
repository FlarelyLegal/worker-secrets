// Public API for Service Binding consumers

export {
  AccessDeniedError,
  EncryptionError,
  MaintenanceError,
  NotFoundError,
  ReadOnlyError,
  ValidationError,
  VaultError,
} from "./errors.js";
export type { default as SecretVaultWorker } from "./rpc.js";
export type {
  AuditConsumer,
  AuditEntry,
  ExportedSecret,
  FlagResult,
  Policy,
  Recipient,
  Role,
  RpcOpts,
  SecretListItem,
  SecretResult,
  ServiceToken,
  User,
  VersionListItem,
  VersionResult,
} from "./services/types.js";
