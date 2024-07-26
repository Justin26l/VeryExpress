const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['./src/cli.ts'], // Your main file
  bundle: true, // Bundle all dependencies
  platform: 'node', // Specify the platform
  target: 'es2016', // Target Node version, adjust as needed
  minify: true, // Minify the output
  tsconfig: './tsconfig.json', // Your tsconfig file
  outfile: './dist/index.js', // Output file
}).catch((e) => {
    console.error(e);
    process.exit(1);
});