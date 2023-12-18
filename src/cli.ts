#!/usr/bin/env node
import generate from './index';
import fs from 'fs';
import minimist from 'minimist';

var args = minimist(process.argv.slice(2));
console.log('\x1b[35m%s\x1b[0m', '\n========== veryExpress CLI (vex) ==========\n');
if ('h' in args) {
    // log blue
    console.log(`
Usage: vex [jsonSchemaDir] [openapiDir] [outputDir]
    -h : Help
    -j : jsonSchemaDir 
    -a : openApiDir
    -o : outputDir
`);
    process.exit(0);
}
const schemaDir = args.j || args.jsonSchemaDir || process.argv[2] || './jsonSchema';
const openapiDir = args.a || args.openApiDir || process.argv[3] || './openapi';
const outputDir = args.o || args.outputDir || process.argv[4] || './output';

if(!fs.existsSync(schemaDir)){
    console.log('\x1b[31m%s\x1b[0m', 'Schema Dir Not Found:', schemaDir);
    process.exit(1);
};

if(!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
};

generate(
    schemaDir,
    openapiDir,
    outputDir,
);

