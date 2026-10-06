/**
 * Migration: v0.8.5
 *
 * `UserAuthProfiles` identity-key rename:
 *   Before:  { provider, oauthId, ... }
 *   After:   { provider, providerUserId, ... }
 *
 * Why the rename: `(provider, providerUserId)` is the account-linking key, and `oauthId` lied about
 * it — the value is the subject within `provider`'s namespace, which for a broker is its own user id
 * and for a `provider: "local"` row is absent entirely. "oauth" also names a protocol the field does
 * not require: GitHub is plain OAuth2, Keycloak-brokered SAML yields a NameID, and a Firebase uid is
 * the broker's id rather than an OIDC `sub`.
 *
 * The same release adds a composite unique index on `(provider, providerUserId)`, so a
 * `x-documentConfig.uniqueIndex` entry naming `oauthId` is rewritten too.
 *
 * Scope: only a document whose `x-documentConfig.documentName` is `"UserAuthProfiles"`. Idempotent —
 * a file already carrying `providerUserId` is left alone. The `description` is injected only when the
 * property has none, so a hand-written one survives.
 *
 * Note: this runs BEFORE generation, which then re-copies `templates/jsonSchema` into the schema dir
 * and overwrites the sample `UserAuthProfiles.json` anyway (`copyDir(..., overwrite=true)`). The
 * migration therefore matters for projects that pinned the file via
 * `.vex/meta.json → files.<path>.allowOverwrite = false`: without it those projects would keep
 * `oauthId` in the model while the regenerated services use `providerUserId`, which does not compile.
 *
 * The database half is the project's job: the migration mechanism never touches a live database.
 * See the release note for the `ALTER TABLE ... RENAME COLUMN` statement.
 */

import fs from "fs";
import path from "path";
import log from "~/utils/logger";

const DOCUMENT_NAME = "UserAuthProfiles";
const OLD_FIELD = "oauthId";
const NEW_FIELD = "providerUserId";

const DESCRIPTION =
    "External subject within `provider`'s namespace. With `provider` it forms the account-linking " +
    "key and the composite unique index. NULL for provider=\"local\". This is the subject (an OIDC " +
    "`sub` or a broker user id), never a token.";

type JsonObject = Record<string, any>;

/**
 * Rename a property key in place, preserving declaration order.
 *
 * Order is kept because JSON schema files are hand-readable and a rename should produce a one-line
 * diff, not a reshuffled object.
 */
function renameProperty(source: JsonObject, from: string, to: string): JsonObject {
    const renamed: JsonObject = {};
    for (const [key, value] of Object.entries(source)) {
        if (key !== from) {
            renamed[key] = value;
            continue;
        }

        renamed[to] = typeof value === "object" && value !== null && !Array.isArray(value) && !value.description
            ? { ...value, description: DESCRIPTION }
            : value;
    }

    return renamed;
}

/** Rewrite any `uniqueIndex` entry that names the old field. */
function renameIndexColumns(config: JsonObject): boolean {
    const indexes = config.uniqueIndex;
    if (!Array.isArray(indexes)) return false;

    let touched = false;
    const next = indexes.map((entry: unknown) => {
        if (!Array.isArray(entry)) return entry;
        return entry.map((column: unknown) => {
            if (column !== OLD_FIELD) return column;
            touched = true;
            return NEW_FIELD;
        });
    });

    if (touched) config.uniqueIndex = next;
    return touched;
}

/** Returns true when the file was rewritten. */
function migrateSchemaFile(filePath: string): boolean {
    let schema: JsonObject;

    try {
        schema = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    catch (err: any) {
        log.error(`Migration v0.8.5: failed to parse ${filePath}: ${err.message}`);
        return false;
    }

    const config = schema["x-documentConfig"] as JsonObject | undefined;
    if (!config || config.documentName !== DOCUMENT_NAME) return false;

    const properties = schema.properties as JsonObject | undefined;
    const hasOld = !!properties && OLD_FIELD in properties;
    const indexTouched = renameIndexColumns(config);

    if (!hasOld) {
        if (indexTouched) {
            fs.writeFileSync(filePath, JSON.stringify(schema, null, 2) + "\n", "utf8");
            log.writing(`Migration v0.8.5: rewrote uniqueIndex in ${path.basename(filePath)}`);
            return true;
        }

        log.info(`Migration v0.8.5: skip ${path.basename(filePath)} (already migrated)`);
        return false;
    }

    if (NEW_FIELD in properties) {
        // Both names present: keep the new one, drop the legacy duplicate rather than emit two columns.
        const rest = { ...properties };
        delete rest[OLD_FIELD];
        schema.properties = rest;
        fs.writeFileSync(filePath, JSON.stringify(schema, null, 2) + "\n", "utf8");
        log.warn(
            `Migration v0.8.5: ${path.basename(filePath)} declared both "${OLD_FIELD}" and ` +
            `"${NEW_FIELD}"; kept "${NEW_FIELD}" and dropped "${OLD_FIELD}"`
        );
        return true;
    }

    schema.properties = renameProperty(properties, OLD_FIELD, NEW_FIELD);

    fs.writeFileSync(filePath, JSON.stringify(schema, null, 2) + "\n", "utf8");
    log.writing(`Migration v0.8.5: renamed ${OLD_FIELD} → ${NEW_FIELD} in ${path.basename(filePath)}`);
    return true;
}

export function run(jsonSchemaDir: string): void {
    if (!fs.existsSync(jsonSchemaDir)) {
        log.warn(`Migration v0.8.5: jsonSchemaDir not found: ${jsonSchemaDir}`);
        return;
    }

    const files = fs.readdirSync(jsonSchemaDir).filter((f) => f.endsWith(".json"));
    let count = 0;

    for (const file of files) {
        if (migrateSchemaFile(path.join(jsonSchemaDir, file))) count++;
    }

    log.info(`Migration v0.8.5: done. ${count} file(s) migrated.`);
}
