import jsYaml from 'js-yaml';
import fs from 'fs';

export function loadYaml(yamlFilePath: string) {
    try {
        return jsYaml.load(fs.readFileSync(yamlFilePath, 'utf8'));
    } catch (e: any) {
        console.error('Error Load OpenApi File :\n', e.message || e);
    }
};