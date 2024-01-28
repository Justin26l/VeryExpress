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

/** 
 * build mongoose select object
 * @param fieldsString stringified array of FieldPath
 * @error may throw an error if the fieldsString is not a valid JSON
 */
export function parseFieldsSelect(fieldsString:string): Promise<{[key:string]:number}> {
    return new Promise((resolve, reject) => {
        let fieldArr: string[] = [];
        try {
            fieldArr = JSON.parse(fieldsString);
        } catch (err) {
            return reject("Invalid fields string");
        }

        // Convert the fieldArr to an object that can be used in the select method
        const selectFields = fieldArr.reduce((obj:any, field:string) => {
            obj[field] = 1;
            return obj;
        }, {} as Record<string, number>);

        resolve(selectFields);
    });
}