#!/usr/bin/env node

// Fix openapi-generated filter types to allow primitives, based on swagger schema info.

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dir, '../src/api-client/models');
const swaggerPath = join(__dir, '../../api/src/openapi/swagger.json');

const swagger = JSON.parse(readFileSync(swaggerPath, 'utf8'));
const schemas = swagger?.components?.schemas ?? {};

function primitiveTypeFromSwaggerProp(prop) {
    if (!prop?.anyOf) return null;
    const primitive = prop.anyOf.find(s => s.type && !s['$ref']);
    if (!primitive) return null;
    if (primitive.type === 'boolean') return 'boolean';
    if (primitive.type === 'number' || primitive.type === 'integer') return 'number';
    return 'string';
}

function primitiveTypeFromTsTypeName(tsType, swaggerEntityName, fieldKey) {
    if (tsType === 'FieldFilterBoolean') return 'boolean';
    if (tsType === 'FieldFilterNumber') return 'number';
    if (tsType === 'FieldFilterString') return 'string';
    if (/^FieldFilter[A-Z]/.test(tsType)) return 'string';
    if (swaggerEntityName && fieldKey && schemas[swaggerEntityName]?.properties) {
        const swaggerKey = fieldKey === 'id' ? '_id' : fieldKey;
        const prop = schemas[swaggerEntityName].properties[swaggerKey];
        if (prop) return primitiveTypeFromSwaggerProp(prop);
    }
    return null;
}

// Field-level: FieldFilterBoolean, FilterAreaActive, FilterAreaCountryCode, etc.
const FIELD_FILTER_RE = /^(FieldFilter[A-Z]|Filter[A-Z][a-z]+[A-Z])[a-zA-Z]*\.ts$/;
// Top-level aggregates: FilterArea, FilterClient, FilterJob, etc.
const TOP_FILTER_RE = /^Filter([A-Z][a-zA-Z]+)\.ts$/;

const NULL_CHECK = '    if (value == null) {\n        return value;\n    }';
const PRIMITIVE_GUARD = '\n    // patch: pass primitives unchanged\n    if (typeof value !== \'object\') return value;';

let stats = { fieldPatched: 0, topPatched: 0, skipped: 0 };

// Pass 1: patch field-level ToJSONTyped / FromJSONTyped
for (const file of readdirSync(modelsDir)) {
    if (!FIELD_FILTER_RE.test(file)) continue;
    const filePath = join(modelsDir, file);
    let src = readFileSync(filePath, 'utf8');
    if (src.includes('// patch:') || !src.includes(NULL_CHECK)) { stats.skipped++; continue; }
    src = src.replaceAll(NULL_CHECK, NULL_CHECK + PRIMITIVE_GUARD);
    writeFileSync(filePath, src, 'utf8');
    console.log('[patch] field  v  ' + file);
    stats.fieldPatched++;
}

// Pass 2: patch top-level filter interface property types
for (const file of readdirSync(modelsDir)) {
    const match = TOP_FILTER_RE.exec(file);
    if (!match) continue;
    const filePath = join(modelsDir, file);
    let src = readFileSync(filePath, 'utf8');
    if (src.includes('// patch:')) { stats.skipped++; continue; }
    const swaggerEntityName = file.replace('.ts', '');
    // Match: `    fieldName?: SomeType;` — skip $or/$and lines
    const PROP_RE = /^( {4}(?!\$or|\$and)(\w+)\?:\s*)([A-Za-z]+)(;)$/gm;
    let modified = false;
    const patched = src.replace(PROP_RE, (line, prefix, fieldKey, tsType, semi) => {
        const primitive = primitiveTypeFromTsTypeName(tsType, swaggerEntityName, fieldKey);
        if (!primitive || line.includes(' | ' + primitive)) return line;
        modified = true;
        return prefix + tsType + ' | ' + primitive + semi;
    });
    if (!modified) { stats.skipped++; continue; }
    writeFileSync(filePath, patched, 'utf8');
    console.log('[patch] top    v  ' + file);
    stats.topPatched++;
}

console.log('\n[patch-filter-types] Done. Field: ' + stats.fieldPatched + ', Top: ' + stats.topPatched + ', Skipped: ' + stats.skipped);
