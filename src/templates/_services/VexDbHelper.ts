import { DataSource } from "typeorm";
import utils from "../_utils";
import path from "path";

export default async function runSqlMigrations(dataSource: DataSource, migDir?: string): Promise<void> {
    if ((process.env.SQL_RUN_MIGRATIONS || "").toLowerCase() !== "true") {
        return;
    }
    try {
        const dir = migDir || (process.env.SQL_MIGRATIONS_DIR || "src/system/_models/migrations");
        const ordered = await utils.migrationOrdering.resolveMigrationOrder(dir);
        if (!ordered || !ordered.length) {
            utils.log.infoSql(`No migrations found in ${dir}`);
            return;
        }
        for (const fname of ordered) {
            const fullPath = path.join(process.cwd(), dir, fname);
            let mod: { up?: (ds: DataSource) => Promise<void> } | undefined;
            try { mod = require(fullPath); }
            catch (e1) {
                try { mod = require(fullPath + ".ts"); }
                catch (e2) {
                    try { mod = require(fullPath + ".js"); }
                    catch (e3) {
                        utils.log.errorSql(`Failed requiring migration ${fname}`, e3 || e2 || e1);
                        throw e3 || e2 || e1;
                    }
                }
            }
            if (mod && typeof mod.up === "function") {
                await mod.up(dataSource);
                utils.log.infoSql(`Applied migration ${fname}`);
            } else {
                utils.log.infoSql(`Skipping migration ${fname}, no exported up()`);
            }
        }
        utils.log.infoSql(`SQL migrations applied from ${dir}`);
    }
    catch (mErr: unknown) {
        utils.log.errorSql("Failed to apply SQL migrations", mErr);
    }
}