// Public API for Service Binding consumers
export type { default as SecretVaultWorker } from "./rpc.js";
export type { RpcOpts } from "./services/types.js";
export type {
	SecretResult,
	SecretListItem,
	VersionResult,
	VersionListItem,
	ExportedSecret,
	ServiceToken,
	User,
	Role,
	Policy,
	FlagResult,
	AuditEntry,
	AuditConsumer,
	Recipient,
} from "./services/types.js";
export {
	VaultError,
	NotFoundError,
	AccessDeniedError,
	ValidationError,
	EncryptionError,
	MaintenanceError,
	ReadOnlyError,
} from "./errors.js";
