#!/usr/bin/env node
import generate from './index';
import fs from 'fs';

const schemaDir = process.argv[2] || './jsonSchema';
const openapi = process.argv[3] || './openapi';
const outputDir = process.argv[4] || './output';

if(!fs.existsSync(schemaDir)){
    console.log('\x1b[31m%s\x1b[0m', 'Schema Dir Not Found:', schemaDir);
    process.exit(1);
};

if(!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
};

generate(
    schemaDir,
    openapi,
    outputDir,
);


