#!/usr/bin/env node
import generate from './index';
import fs from 'fs';
import childProcess from 'child_process';
import minimist from 'minimist';

import log from './utils/log';

/**
 * configuration process
 */
var args: minimist.ParsedArgs = minimist(process.argv.slice(2));
var config: any = {};

if (fs.existsSync('vex.config.json')) {
    try {
        config = JSON.parse(fs.readFileSync('vex.config.json', 'utf8'));
    }
    catch (err) {
        log.error('failed to parse vex.config.json', err);
        process.exit(1);
    };
};

// record input args or use default
config.commitBeforeGenerate = config.commitBeforeGenerate ?? false;
config.jsonSchemaDir = args.j || args.jsonSchemaDir || config.jsonSchemaDir || './jsonSchema';
config.outputDir = args.o || args.outputDir || config.outputDir || './src';

console.log('\x1b[35m%s\x1b[0m', '\n========== veryExpress CLI (vex) Start ==========\n');
log.writing('vex.config.json');
fs.writeFileSync('vex.config.json', JSON.stringify(config, null, 4));

/**
 * Cli handler
 */

// -h : Help
if ('h' in args) {
    console.log(`
Usage: vex [jsonSchemaDir] [outputDir]
    -h : Help
    -j : jsonSchemaDir (config: ${config.jsonSchemaDir})
    -o : outputDir (config: ${config.outputDir})
`);
    process.exit(0);
};

// check dir exists
if (!fs.existsSync(config.jsonSchemaDir)) {
    log.error('Schema Dir Not Found:', config.jsonSchemaDir);
    process.exit(1);
};

if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir);
};

// commit before generate
if (config.commitBeforeGenerate === true) {
    try {
        log.info('git commit "before vex-gen"');
        childProcess.execSync('git add . && git commit -m "before vex-gen"', { stdio: 'inherit' });
    }
    catch (err) {
        log.error('git commit "before vex-gen" failed', err);
    };
};

// run main process
generate(
    config.jsonSchemaDir,
    config.outputDir,
);

console.log('\x1b[35m%s\x1b[0m', '\n========== veryExpress CLI (vex) Complete ==========\n');
