import * as types from "../types/types";
import log from "../utils/logger";
import { isAuthEnabled, isRbacEnabled } from "../utils/generator";

/**
 * Auth and RBAC are built on the `User` document: the generated auth controller reads it through
 * `UserModel`, and `UserRole` declares a foreign key to it. A project may generate that document
 * (`app.useUserSchema: true`) or ship its own `User.json`; either way it has to exist.
 *
 * Reported at generation time, before foreign keys resolve, so the failure names the missing
 * document instead of surfacing as a relation builder error.
 */
export function validateAuthDocuments(
    documents: { path: string, schema: types.jsonSchema }[],
    compilerOptions: types.compilerOptions,
): void {
    const auth = isAuthEnabled(compilerOptions);
    const rbac = isRbacEnabled(compilerOptions);
    if (!auth && !rbac) return;

    const hasUserDocument = documents.some(
        doc => doc.schema["x-documentConfig"]?.documentName === "User",
    );
    if (hasUserDocument) return;

    const features = [auth ? "authentication" : "", rbac ? "RBAC" : ""].filter(Boolean).join(" and ");

    log.error(
        `${features} needs a document named "User", and this project has none. ` +
        `Set "app.useUserSchema" to true to generate the built-in one, or add your own User.json.`,
    );
}
