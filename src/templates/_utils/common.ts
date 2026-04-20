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
 * Parse _select query/body param into a fields array
 * @param fieldsString json stringified array of string
 * @error may throw an error if the fieldsString is not a valid JSON
 */
export function parseFieldsSelect(req: Request) : string[] | undefined {
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
    
    return _selectRaw;
}

export function parseCollectionJoin(req: Request, availablePopulateOptions?: {[key:string]: string}) : Array<{ path: string; select?: string; options?: any }> | undefined {
    // if no _join param provided, nothing to do
    if(!req.query._join && !req.body._join) {
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
    const populateOptions: Array<{ path: string; select?: string; options?: any }> = [];
    const available = availablePopulateOptions || {};
    if(_joinRaw.length > 0) {
        _joinRaw.forEach((refKey: any) => {
            if(available[refKey]) {
                populateOptions.push({
                    path: refKey,
                    select: available[refKey],
                    options: { lean: true }
                });
            }
            else {
                // include basic populate entry even if no select mapping provided
                populateOptions.push({ path: refKey, options: { lean: true } });
            }
        });
    }

    return populateOptions.length > 0 ? populateOptions : undefined;
}

/**
 * Parse _join query/body param into a TypeORM relations array
 * @param req Express request
 * @param allowedRelations optional allowlist — if provided, only matching relation names are returned
 */
export function parseRelations(req: Request, allowedRelations?: string[]): string[] | undefined {
    if (!req.query._join && !req.body._join) {
        return undefined;
    }

    let _joinRaw: string[] = [];

    if (req.method === "GET") {
        const rawString = String(req.query._join);
        if (!rawString) return undefined;
        _joinRaw = JSON.parse(rawString);
    } else {
        _joinRaw = req.body._join;
    }

    const err = new VexResponseError(400, response.code.err_validation, "Invalid field \"_join\", only json array of relation names accepted");
    if (!Array.isArray(_joinRaw)) throw err;
    for (const item of _joinRaw) {
        if (typeof item !== "string") throw err;
    }

    const filtered = allowedRelations && allowedRelations.length > 0
        ? _joinRaw.filter(r => allowedRelations.includes(r))
        : _joinRaw;

    return filtered.length > 0 ? filtered : undefined;
}

export default {
    loadYaml,
    parseFieldsSelect,
    parseCollectionJoin,
    parseRelations
};