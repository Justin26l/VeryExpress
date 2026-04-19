export default function knexTemplate(options: {
    documentName: string,
    tables: Array<{
        name: string;
        columns: string[]; // lines to execute inside createTable
        indexes?: string[];
        foreigns?: string[];
    }>;
    compilerOptions?: any,
}) {
    const tables = options.tables || [];

    const upParts: string[] = [];
    for (const t of tables) {
        const cols = (t.columns || []).join("\n");
        const idxs = (t.indexes || []).join("\n");
        const fgs = (t.foreigns || []).join("\n");
        upParts.push(`  const exists_${t.name} = await knex.schema.hasTable("${t.name}");\n  if (!exists_${t.name}) {\n    await knex.schema.createTable("${t.name}", function(table) {\n      table.increments("id").primary();\n${cols}\n${idxs ? "\n" + idxs : ""}\n${fgs ? "\n" + fgs : ""}\n    });\n  }`);
    }

    const downParts: string[] = [];
    // drop in reverse order
    for (let i = tables.length - 1; i >= 0; i--) {
        downParts.push(`  await knex.schema.dropTableIfExists("${tables[i].name}");`);
    }

    return `/* Auto-generated Knex migration for ${options.documentName} */\nimport { Knex } from "knex";\n\nexport async function up(knex: Knex): Promise<void> {\n${upParts.join("\n\n")}\n}\n\nexport async function down(knex: Knex): Promise<void> {\n${downParts.join("\n")}\n}\n`;
}
