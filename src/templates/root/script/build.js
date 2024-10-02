// copy ./openapi to tsconfig's outDir

const fs = require('fs');
const path = require('path');

async function loadStripJsonComments() {
    const { default: stripJsonComments } = await import('strip-json-comments');
    return stripJsonComments;
}

async function main(vexConfigPath) {
    // Load strip-json-comments dynamically
    const stripJsonComments = await loadStripJsonComments();

    // 1. read tsconfig.json to get outDir
    const tsconfigPath = path.resolve(__dirname, '../tsconfig.json');
    const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(stripJsonComments(tsconfigContent));
    const outDir = tsconfig.compilerOptions.outDir;

    // 2. read vex.config.json to get openapiDir
    const vexConfigPathResolve = path.resolve(__dirname, vexConfigPath);
    const vexConfigContent = fs.readFileSync(vexConfigPathResolve, 'utf-8');
    const vexConfig = JSON.parse(stripJsonComments(vexConfigContent));
    const openapiDir = vexConfig.openapiDir;

    // 3. copy ./openapi to outDir
    const outDirOpenapi = path.resolve(outDir, 'openapi');
    if (!fs.existsSync(outDirOpenapi)) {
        fs.mkdirSync(outDirOpenapi, { recursive: true });
    }
    fs.readdirSync(openapiDir).forEach((file) => {
        fs.copyFileSync(path.resolve(openapiDir, file), path.resolve(outDirOpenapi, file));
    });
}


// Execute the main function
main('../vex.config.json').catch(err => {
    console.error(err);
    process.exit(1);
});