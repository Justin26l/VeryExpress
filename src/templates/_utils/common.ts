// {{headerComment}}

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
 * @param fieldsString json stringified array of string
 * @error may throw an error if the fieldsString is not a valid JSON
 */
export function parseFieldsSelect(selectString: any) : { [key: string]: number } | undefined {
    const ErrorArrStrMsg = "Invalid select string, only array of string accepted";

    if (typeof selectString === "undefined" || selectString === "") {
        return undefined;
    }
    else if (typeof selectString !== "string") {
        throw new Error(ErrorArrStrMsg);
    }

    const fieldArr: string[] = JSON.parse(selectString);

    if (!Array.isArray(fieldArr)) {
        throw new Error(ErrorArrStrMsg);
    }

    for (let i = 0; i < fieldArr.length; i++) {
        if (typeof fieldArr[i] !== "string") {
            throw new Error(ErrorArrStrMsg);
        }
    }
    // Convert the fieldArr to an object that can be used in the select method
    const selectFields = fieldArr.reduce((obj: any, field: string) => {
        obj[field] = 1;
        return obj;
    }, {} as Record<string, number>);

    return selectFields;
}

export default {
    loadYaml,
    parseFieldsSelect
};