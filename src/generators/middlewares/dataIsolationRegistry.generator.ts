import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isolationRulesOf } from "~/preprocess/isolation";

/**
 * Generates DataIsolationRegistry.gen.ts — a static map of entity class name → isolation
 * rules.
 *
 * The repository adapters read this registry and AND every rule into their queries with
 * the value resolved from the request context (`UserContext`). The registry is written for
 * every project, empty when no document declares a rule, so the adapters can import it
 * unconditionally.
 */
export async function compile(options: {
    allSchemas: types.jsonSchema[];
    middlewareDir: string;
}): Promise<void> {
    log.process("Data Isolation Registry");

    const entries: string[] = [];

    for (const schema of options.allSchemas) {
        const documentName = schema["x-documentConfig"].documentName;
        const rules = isolationRulesOf(schema["x-documentConfig"]);
        if (rules.length === 0) continue;

        const ruleSource = rules
            .map(rule => `        { field: ${JSON.stringify(rule.field)}, source: ${JSON.stringify(rule.source)}, onMissing: ${JSON.stringify(rule.onMissing)} }`)
            .join(",\n");

        entries.push(`    "${documentName}Entity": [\n${ruleSource},\n    ]`);
    }

    const source = `// {{headerComment}}
export type IsolationSource = "user._id" | "user.tenantId";
export type IsolationOnMissing = "skip" | "deny";

export interface DataIsolationEntry {
    field: string;
    source: IsolationSource;
    onMissing: IsolationOnMissing;
}

export const entityIsolation: Record<string, DataIsolationEntry[]> = {
${entries.join(",\n")}
};
`;

    const outPath = `${options.middlewareDir}/DataIsolationRegistry.gen.ts`;
    utils.common.writeFile("Data Isolation Registry", outPath, utils.template.format(source));
}
