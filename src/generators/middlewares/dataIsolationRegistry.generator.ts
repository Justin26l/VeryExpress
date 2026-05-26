import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";

/**
 * Generates DataIsolationRegistry.gen.ts — a static object mapping
 * entity class names → { field } for ownership-based data isolation.
 *
 * Each entity with a dataIsolation config gets an entry. The TypeORM
 * repository adapter reads this registry at runtime and injects the
 * ownership filter into all queries using the current user context
 * from AsyncLocalStorage (DataIsolationContext).
 */
export async function compile(options: {
    allSchemas: types.jsonSchema[];
    middlewareDir: string;
}): Promise<void> {
    log.process("Data Isolation Registry");

    const entries: string[] = [];

    for (const schema of options.allSchemas) {
        const config = schema["x-documentConfig"].dataIsolation;
        if (!config) continue;

        const documentName = schema["x-documentConfig"].documentName;
        entries.push(`    "${documentName}Entity": { field: "${config.field}" }`);
    }

    if (entries.length === 0) return;

    const source = `// {{headerComment}}
export interface DataIsolationEntry {
  field: string;
}

export const entityIsolation: Record<string, DataIsolationEntry> = {
${entries.join(",\n")}
};
`;

    const outPath = `${options.middlewareDir}/DataIsolationRegistry.gen.ts`;
    utils.common.writeFile("Data Isolation Registry", outPath, utils.template.format(source));
}
