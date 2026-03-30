// --- Roles ---
export const ROLE_ADMIN = "admin";
export const ROLE_OPERATOR = "operator";
export const ROLE_READER = "reader";
export const DEFAULT_ROLES = [ROLE_ADMIN, ROLE_OPERATOR, ROLE_READER] as const;

// --- Scopes ---
export const SCOPE_ALL = "*";
export const SCOPE_READ = "read";
export const SCOPE_WRITE = "write";
export const SCOPE_DELETE = "delete";

// --- Auth methods ---
export const AUTH_INTERACTIVE = "interactive";
export const AUTH_SERVICE_TOKEN = "service_token";
export const AUTH_REJECTED = "rejected";

// --- Audit actions ---
export const ACTION_GET = "get";
export const ACTION_SET = "set";
export const ACTION_DELETE = "delete";
export const ACTION_LIST = "list";
export const ACTION_EXPORT = "export";
export const ACTION_IMPORT = "import";
export const ACTION_VERSIONS = "versions";
export const ACTION_RESTORE = "restore";
export const ACTION_AUTH_FAILED = "auth_failed";
export const ACTION_LIST_TOKENS = "list_tokens";
export const ACTION_REGISTER_TOKEN = "register_token";
export const ACTION_REVOKE_TOKEN = "revoke_token";
export const ACTION_LIST_USERS = "list_users";
export const ACTION_ADD_USER = "add_user";
export const ACTION_UPDATE_USER = "update_user";
export const ACTION_DELETE_USER = "delete_user";
export const ACTION_LIST_ROLES = "list_roles";
export const ACTION_SET_ROLE = "set_role";
export const ACTION_UPDATE_ROLE = "update_role";
export const ACTION_DELETE_ROLE = "delete_role";
export const ACTION_LIST_FLAGS = "list_flags";
export const ACTION_GET_FLAG = "get_flag";
export const ACTION_SET_FLAG = "set_flag";
export const ACTION_DELETE_FLAG = "delete_flag";

// --- Flag keys ---
export const FLAG_MAINTENANCE = "maintenance";
export const FLAG_READ_ONLY = "read_only";
export const FLAG_AUDIT_RETENTION_DAYS = "audit_retention_days";
export const FLAG_AUDIT_CLEANUP_PROBABILITY = "audit_cleanup_probability";
export const FLAG_VERSIONING_ENABLED = "versioning_enabled";
export const FLAG_MAX_VERSIONS = "max_versions";
export const FLAG_REQUIRE_DESCRIPTION = "require_description";
export const FLAG_REQUIRE_TAGS = "require_tags";
export const FLAG_MAX_SECRETS = "max_secrets";
export const FLAG_HMAC_REQUIRED = "hmac_required";
export const FLAG_DISABLE_EXPORT = "disable_export";
export const FLAG_ALLOWED_EMAILS_ROLE = "allowed_emails_role";
export const FLAG_PUBLIC_PAGES_ENABLED = "public_pages_enabled";
export const FLAG_ENFORCE_EXPIRY = "enforce_expiry";
export const FLAG_BURN_AFTER_READING = "burn_after_reading";
export const FLAG_MAX_SECRET_SIZE_KB = "max_secret_size_kb";
export const FLAG_REQUIRE_ENVELOPE_ENCRYPTION = "require_envelope_encryption";
export const FLAG_SECRET_NAME_PATTERN = "secret_name_pattern";
export const FLAG_MAX_TAGS_PER_SECRET = "max_tags_per_secret";
export const FLAG_WEBHOOK_URL = "webhook_url";
export const FLAG_WEBHOOK_FILTER = "webhook_filter";
export const FLAG_ALLOWED_COUNTRIES = "allowed_countries";
export const FLAG_AUTO_PROVISION_ROLE = "auto_provision_role";
export const FLAG_REQUIRE_WARP = "require_warp";

export const ACTION_WARP_REJECTED = "warp_rejected";
export const ACTION_EXPIRED_ACCESS = "expired_access";
