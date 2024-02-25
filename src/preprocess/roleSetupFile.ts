import fs from 'fs'
import * as types from '../types/types'
import { loadJson } from '../utils'
import log from '../utils/logger';

export function roleSetupFile(options: {
    documentName: string[],
    roleOutDir: string,
    compilerOptions: types.compilerOptions
}): void {

    const actionArray = [ "create", "search", "read", "update", "delete"];

    options.compilerOptions.app.roles.forEach((role) => {

        log.process(`RBAC Setting : ${role}`);

        // 1. check role file exist, if not create it
        const roleFilePath = `${options.roleOutDir}/${role}.json`
        if (!fs.existsSync(roleFilePath)) {
            fs.writeFileSync(roleFilePath, JSON.stringify({}, null, 4));
        };

        // 2. check role obejct exist, if not add it in content
        const content = loadJson<types.roleJson>(roleFilePath);
        let writeFile = false;
        options.documentName.forEach(documentName => {
            if (!content[documentName]) {
                writeFile = true;
                content[documentName] = actionArray;
            }
        });

        // 3. write file if needed
        if (writeFile) {
            log.writing(`RBAC Setting : ${roleFilePath}`);
            fs.writeFileSync(roleFilePath, JSON.stringify(content, null, 4));
        }
        else {
            log.info(`RBAC Setting : "${role}" No changes `);
        }
    });

};
