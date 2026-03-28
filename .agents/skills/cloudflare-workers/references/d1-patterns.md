# D1 patterns in this project

Source: `secret-vault/src/routes/secrets.ts`, `secret-vault/src/routes/tokens.ts`, `secret-vault/src/auth.ts`

## Query patterns

### Select one row
```typescript
const row = await c.env.DB.prepare("SELECT * FROM secrets WHERE key = ?")
  .bind(key)
  .first<{ key: string; value: string; iv: string; description: string }>();

if (!row) return c.json({ error: "Not found" }, 404);
```

### Select multiple rows
```typescript
const { results } = await c.env.DB.prepare(
  "SELECT key, description, created_at, updated_at FROM secrets ORDER BY key"
).all();

return c.json({ secrets: results });
```

### Select with limit
```typescript
const limit = Math.min(Math.max(parseInt(str, 10) || 50, 1), 500);
const { results } = await c.env.DB.prepare(
  "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?"
).bind(limit).all();
```

### Upsert (INSERT ... ON CONFLICT)
```typescript
await c.env.DB.prepare(
  `INSERT INTO secrets (key, value, iv, description, created_at, updated_at)
   VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
   ON CONFLICT(key) DO UPDATE SET
     value = excluded.value,
     iv = excluded.iv,
     description = excluded.description,
     updated_at = datetime('now')`
).bind(key, ciphertext, iv, description).run();
```

### Delete with change detection
```typescript
const result = await c.env.DB.prepare("DELETE FROM secrets WHERE key = ?")
  .bind(key)
  .run();

if (result.meta.changes === 0) return c.json({ error: "Not found" }, 404);
```

### Insert (audit log)
```typescript
await c.env.DB.prepare(
  "INSERT INTO audit_log (method, identity, action, secret_key, ip) VALUES (?, ?, ?, ?, ?)"
).bind(method, identity, action, secretKey, ip).run();
```

### Update timestamp
```typescript
await c.env.DB.prepare(
  "UPDATE service_tokens SET last_used_at = datetime('now') WHERE client_id = ?"
).bind(clientId).run();
```

## Batch operations

For atomic multi-statement work, use `db.batch()`:
```typescript
await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO ...").bind(...),
  c.env.DB.prepare("UPDATE ...").bind(...),
]);
```

## Error handling

D1 calls can throw on connection issues, malformed SQL, or constraint violations. Always wrap in try-catch in production code:

```typescript
try {
  await c.env.DB.prepare("...").bind(...).run();
} catch (e) {
  // Don't expose SQL errors to the client
  return c.json({ error: "Database error" }, 500);
}
```
