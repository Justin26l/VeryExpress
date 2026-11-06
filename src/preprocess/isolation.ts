import * as types from "../types/types";
import log from "../utils/logger";
import { isTenantEnabled } from "../utils/generator";

/**
 * Isolation rules.
 *
 * A rule becomes a query term the repository ANDs into every read and write of the
 * document. `source` picks the request-context value; `onMissing` decides what happens
 * when that value is absent.
 *
 * The legacy `x-documentConfig.dataIsolation: { field }` form is an ownership rule with
 * `source: "user._id"` and `onMissing: "skip"`. See docs/features/dataIsolation.md and
 * docs/features/tenantIsolation.md.
 */

const VALID_SOURCES: types.IsolationSource[] = ["user._id", "user.tenantId"];
const VALID_ON_MISSING: types.IsolationOnMissing[] = ["skip", "deny"];

export const DEFAULT_ON_MISSING: Record<types.IsolationSource, types.IsolationOnMissing> = {
    "user._id": "skip",
    "user.tenantId": "deny",
};

/**
 * Rules declared by a document config, in current form.
 *
 * Reads `isolation` when present, otherwise converts the legacy `dataIsolation` field.
 * Pure — safe to call before or after normalization.
 */
export function isolationRulesOf(config: types.documentConfig | undefined): types.IsolationRule[] {
    if (!config) return [];

    if (Array.isArray(config.isolation) && config.isolation.length > 0) {
        return config.isolation;
    }

    if (config.dataIsolation && typeof config.dataIsolation.field === "string") {
        return [{
            field: config.dataIsolation.field,
            source: "user._id",
            onMissing: DEFAULT_ON_MISSING["user._id"],
        }];
    }

    return [];
}

/** Every field the server owns because a rule writes or filters on it. */
export function collectIsolationFields(schema: types.jsonSchema): string[] {
    return isolationRulesOf(schema["x-documentConfig"]).map(rule => rule.field);
}

function describeField(documentName: string, field: string, schemaPath: string): string {
    return `${documentName}.${field} (${schemaPath})`;
}

function findIdentityField(
    documents: { path: string, schema: types.jsonSchema }[],
): { documentName: string, field: string } | undefined {
    for (const doc of documents) {
        const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
        for (const [key, prop] of Object.entries(doc.schema.properties ?? {})) {
            if (prop?.["x-vexData"] === types.xVexDataType.UserId) {
                return { documentName, field: key };
            }
        }
    }
    return undefined;
}

interface validationContext {
    documents: { path: string, schema: types.jsonSchema }[];
    options: types.compilerOptions;
    problems: string[];
}

function checkRuleShape(
    ctx: validationContext,
    doc: { path: string, schema: types.jsonSchema },
    rule: types.IsolationRule,
    index: number,
): void {
    const config = doc.schema["x-documentConfig"];
    const documentName = config?.documentName ?? doc.path;
    const at = `isolation[${index}] of "${documentName}" (${doc.path})`;

    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
        ctx.problems.push(`${at} must be an object { field, source, onMissing? }.`);
        return;
    }

    if (typeof rule.field !== "string" || rule.field.trim() === "") {
        ctx.problems.push(`${at} requires a non-empty "field".`);
        return;
    }

    const prop = doc.schema.properties?.[rule.field];
    if (!prop) {
        ctx.problems.push(
            `${at} names "${rule.field}", which is not a property of "${documentName}".`,
        );
        return;
    }

    if (prop.type !== "string") {
        ctx.problems.push(
            `"${describeField(documentName, rule.field, doc.path)}" is an isolation field but type is ` +
            `"${prop.type}" — expected "string".`,
        );
    }

    if (rule.source === undefined) {
        ctx.problems.push(`${at} requires a "source" — one of: ${VALID_SOURCES.join(" | ")}.`);
    }
    else if (!VALID_SOURCES.includes(rule.source)) {
        ctx.problems.push(
            `${at} has source "${String(rule.source)}" — expected one of: ${VALID_SOURCES.join(" | ")}.`,
        );
    }
    else if (rule.source === "user.tenantId" && !isTenantEnabled(ctx.options)) {
        ctx.problems.push(
            `${at} uses source "user.tenantId" but vex.config.tenant.enable is not true.`,
        );
    }

    if (rule.onMissing !== undefined && !VALID_ON_MISSING.includes(rule.onMissing)) {
        ctx.problems.push(
            `${at} has onMissing "${String(rule.onMissing)}" — expected one of: ${VALID_ON_MISSING.join(" | ")}.`,
        );
    }
}

function checkDuplicateFields(
    ctx: validationContext,
    doc: { path: string, schema: types.jsonSchema },
    rules: types.IsolationRule[],
): void {
    const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
    const seen = new Set<string>();

    for (const rule of rules) {
        if (!rule || typeof rule.field !== "string") continue;
        if (seen.has(rule.field)) {
            ctx.problems.push(
                `"${documentName}" declares isolation on "${rule.field}" more than once (${doc.path}).`,
            );
        }
        seen.add(rule.field);
    }
}

function checkIdentityDocumentNotTenantScoped(
    ctx: validationContext,
    doc: { path: string, schema: types.jsonSchema },
    rules: types.IsolationRule[],
): void {
    const identity = findIdentityField([doc]);
    if (!identity) return;

    for (const rule of rules) {
        if (rule?.source === "user.tenantId") {
            ctx.problems.push(
                `"${describeField(identity.documentName, rule.field, doc.path)}" scopes the identity ` +
                `document by tenant. Login, registration and token refresh query that document before ` +
                `a tenant is known — they would be filtered out. Remove the "user.tenantId" rule from ` +
                `the identity document.`,
            );
        }
    }
}

function checkTenantSources(
    ctx: validationContext,
    identity: { documentName: string, field: string } | undefined,
): void {
    if (!isTenantEnabled(ctx.options)) return;

    if (!identity) {
        ctx.problems.push(
            `vex.config.tenant.enable is true but no document declares x-vexData "userId" — ` +
            `the tenant module links users by that identity.`,
        );
    }

    const userTenant = ctx.documents.find(
        doc => doc.schema["x-documentConfig"]?.documentName === "UserTenant"
    )?.schema;

    if (!userTenant) {
        ctx.problems.push(
            `vex.config.tenant.enable is true but the project has no "UserTenant" document. ` +
            `The generator copies a default one into jsonSchemaDir; restore it to continue.`,
        );
        return;
    }

    for (const field of ["userId", "tenantId"]) {
        const prop = userTenant.properties?.[field];
        if (!prop) {
            ctx.problems.push(`"UserTenant.${field}" is missing — the tenant module reads and writes it.`);
        }
        else if (prop.type !== "string") {
            ctx.problems.push(`"UserTenant.${field}" must be a string UUID, got type "${prop.type}".`);
        }
    }

    if (isolationRulesOf(userTenant["x-documentConfig"]).length > 0) {
        ctx.problems.push(
            `"UserTenant" must not declare isolation — the tenant module reads it before a tenant is known.`,
        );
    }
}

/** Normalize the declared rules into the current shape, in place. Pure apart from that. */
export function normalizeIsolationRules(
    documents: { path: string, schema: types.jsonSchema }[],
): void {
    for (const doc of documents) {
        const config = doc.schema["x-documentConfig"];
        if (!config) continue;
        if (config.isolation !== undefined && !Array.isArray(config.isolation)) continue;

        config.isolation = isolationRulesOf(config).map((rule) => {
            const source = rule.source ?? "user._id";
            return {
                field: rule.field,
                source,
                onMissing: rule.onMissing ?? DEFAULT_ON_MISSING[source] ?? "deny",
            };
        });
    }
}

/** Every problem with the declared rules; empty when the configuration is valid. */
export function collectIsolationProblems(
    documents: { path: string, schema: types.jsonSchema }[],
    compilerOptions: types.compilerOptions,
): string[] {
    const ctx: validationContext = { documents, options: compilerOptions, problems: [] };
    const identity = findIdentityField(documents);

    for (const doc of documents) {
        const config = doc.schema["x-documentConfig"];
        if (!config) continue;

        if (config.isolation !== undefined && !Array.isArray(config.isolation)) {
            ctx.problems.push(
                `x-documentConfig.isolation of "${config.documentName}" (${doc.path}) must be an array.`,
            );
            continue;
        }

        const rules = isolationRulesOf(config);

        rules.forEach((rule, index) => checkRuleShape(ctx, doc, rule, index));
        checkDuplicateFields(ctx, doc, rules);
        checkIdentityDocumentNotTenantScoped(ctx, doc, rules);
    }

    checkTenantSources(ctx, identity);
    return ctx.problems;
}

/**
 * Validate and normalize every document's isolation rules.
 * Called once after every schema has been loaded and formatted.
 */
export function validateIsolationFields(
    documents: { path: string, schema: types.jsonSchema }[],
    compilerOptions: types.compilerOptions,
): void {
    const problems = collectIsolationProblems(documents, compilerOptions);

    if (problems.length > 0) {
        log.error(
            `Isolation definition error:\n` + problems.map(p => `  - ${p}`).join("\n")
        );
    }

    normalizeIsolationRules(documents);
}
