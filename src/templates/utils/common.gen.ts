import jsYaml from 'js-yaml';
import fs from 'fs';
import log from '../../utils/log';

export function loadYaml(yamlFilePath: string) {
    try {
        return jsYaml.load(fs.readFileSync(yamlFilePath, 'utf8'));
    } catch (e: any) {
        log.error('Error Load OpenApi File :\n', e.message || e);
    }
};