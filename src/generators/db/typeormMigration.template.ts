import type { MigrationInterface, QueryRunner } from "typeorm";

export default function typeormMigrationTemplate(options: {
    documentName: string,
    tables: Array<{
        name: string;
        columns: string[];  // SQL column definition lines
        indexes?: string[];
        foreigns?: string[];
    }>;
    compilerOptions?: unknown,
}) {
    const tables = options.tables || [];

    const upLines: string[] = [];
    const downLines: string[] = [];

    for (const t of tables) {
        const colSql = t.columns.join(",\n        ");
        const idxSql = (t.indexes || []).join("\n    ");
        upLines.push(`        await queryRunner.createTable(new Table({
            name: "${t.name}",
            columns: [
                ${colSql}
            ],
        }), true);
        ${idxSql}`);
        downLines.unshift(`        await queryRunner.dropTable("${t.name}", true);`);
    }

    return `/* Auto-generated TypeORM migration for ${options.documentName} */
import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class ${options.documentName}Migration implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
${upLines.join("\n\n")}
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
${downLines.join("\n")}
    }
}
`;
}
