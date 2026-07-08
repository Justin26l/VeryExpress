# Role-Based Access Control (RBAC)

Available from v0.5.x. Document-level permission control per role.

## Configuration

Enable RBAC in `vex.config.json`:

```jsonc
{
    "useRBAC": {
        "roles": ["visitor", "member", "admin"],
        "default": "member"
    }
}
```

## Role files

On first generation, `src/roles/{roleName}.json` files are created with default CRUD permissions per document:

```json
{
    "User": ["create", "read", "update", "delete", "search"],
    "Project": ["create", "read", "update", "delete", "search"]
}
```

Edit these files to customize what each role can access. The generator reads them on every run and preserves manual edits.

## User role assignment

Mark a field in your user schema with `"x-vexData": "role"`:

```jsonc
{
    "role": {
        "type": "string",
        "x-vexData": "role",
        "required": true
    }
}
```

For SQL/TypeORM target, the preprocessor syncs the role enum values from `useRBAC.roles` in `vex.config.json` into `UserRole.json`.

## Generated artifacts

- `src/system/_roles/{roleName}.gen.ts` — Per-role class with permission checking methods
- `src/system/_roles/index.ts` — Aggregated exports
- `src/system/_middlewares/RoleBaseAccessControl.gen.ts` — Express middleware that extracts the user's role from the request and validates against the document's allowed methods

## Custom actions

Beyond default CRUD, roles can define custom action strings. These are captured in the generated role class and available at runtime.

## Request flow

1. Authentication middleware identifies and attaches user + role to request
2. `RoleBaseAccessControl.middleware(documentName)` checks if the user's role has permission for the current HTTP method
3. If not authorized, returns 403
4. If authorized, request proceeds to the controller
