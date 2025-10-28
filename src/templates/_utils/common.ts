// {{headerComment}}
import jsYaml from "js-yaml";
import fs from "fs";
import { Request } from "express";
import VexResponseError from "../_types/VexResponseError.gen";
import response from "./response.gen";

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
export function parseFieldsSelect(req: Request) : ({ [key: string]: number } | undefined) {
    let _selectRaw: string[] = [];

    if(!req.query._select && !req.body._select) {
        return undefined;
    }

    if(req.method === "GET") {
        const selectString = String(req.query._select);
        _selectRaw = JSON.parse(selectString);
    }
    else{
        _selectRaw = req.body._select;
    }

    const ErrorDataType = new VexResponseError(400, response.code.err_validation, "Invalid field \"_select\", only json array of string accepted");
    if (!Array.isArray(_selectRaw)) {
        throw ErrorDataType;
    }

    for (let i = 0; i < _selectRaw.length; i++) {
        if (typeof _selectRaw[i] !== "string") {
            throw ErrorDataType;
        }
    }
    
    // Convert the fieldArr to an object that can be used in the select method
    const selectFields = _selectRaw.reduce((obj: any, field: string) => {
        obj[field] = 1;
        return obj;
    }, {} as Record<string, number>);

    return selectFields;
}

export function parseCollectionJoin(req: Request, availablePopulateOptions:{[key:string]: string}) : { [key: string]: string } | undefined {
    if(!req.query._select && !req.body._select) {
        return undefined;
    }

    let _joinRaw: string[] = [];

    if(req.method === "GET") {
        const rawString = String(req.query._join);
        if (typeof rawString === "undefined" || rawString === "") {
            return undefined;
        }
        _joinRaw = JSON.parse(rawString);
    }
    else{
        _joinRaw = req.body._join;
    }

    const ErrorDataType = new VexResponseError(400, response.code.err_validation, "Invalid field \"_join\", only json array of string accepted");
    if (!Array.isArray(_joinRaw)) {
        throw ErrorDataType;
    }
    for (let i = 0; i < _joinRaw.length; i++) {
        if (typeof _joinRaw[i] !== "string") {
            throw ErrorDataType;
        }
    }
 
    // switch joinArr's item to populate options
    const populateOptions: {[key:string]:any} = [];
    if(_joinRaw.length > 0) {
        _joinRaw.forEach((refKey: any) => {
            if(availablePopulateOptions[refKey]) {
                populateOptions.push({
                    path: refKey,
                    select: availablePopulateOptions[refKey],
                    options: { lean: true }
                });
            }
        });
    }

    return populateOptions;
}

export default {
    loadYaml,
    parseFieldsSelect,
    parseCollectionJoin
};