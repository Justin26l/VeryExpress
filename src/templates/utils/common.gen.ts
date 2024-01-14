import jsYaml from "js-yaml";
import fs from "fs";

export function loadYaml(yamlFilePath: string) {
    try {
        return jsYaml.load(fs.readFileSync(yamlFilePath, "utf8"));
    } catch (e: any) {
        console.log("\x1b[41m%s\x1b[0m", "[ERROR]", "Error Load OpenApi File :\n", e);
        process.exit(0);
    }
}