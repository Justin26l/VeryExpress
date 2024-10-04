// copy openapiDir to tsconfig's outDir

const fs = require('fs');
const path = require('path');

async function loadStripJsonComments() {
    const { default: stripJsonComments } = await import('strip-json-comments');
    return stripJsonComments;
}

async function main() {
    // Load strip-json-comments dynamically
    const stripJsonComments = await loadStripJsonComments();

    const openapiDir = "{{openapiDir}}";
    const tsconfigPath = "tsconfig.json"

    // 1. read tsconfig.json to get outDir
    const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(stripJsonComments(tsconfigContent));
    const outDir = tsconfig.compilerOptions.outDir;

    // 2. copy ./openapi to outDir
    const outDirOpenapi = path.resolve(outDir, 'openapi');
    if (!fs.existsSync(outDirOpenapi)) {
        fs.mkdirSync(outDirOpenapi, { recursive: true });
    }
    fs.readdirSync(openapiDir).forEach((file) => {
        fs.copyFileSync(path.resolve(openapiDir, file), path.resolve(outDirOpenapi, file));
    });
}


// Execute the main function
main()
.catch(err => {
    console.error(err);
    process.exit(1);
});