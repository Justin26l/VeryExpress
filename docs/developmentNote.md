# Development Note
- "Project" or "The Project" is refer to this package which named "VeryExpress", github repository "[Justin26l/VeryExpress](https://github.com/Justin26l/VeryExpress)", npm package "[very-express](https://www.npmjs.com/package/very-express)".  
  
- "Package" is refer to one of the node module, npm package, third-party library.  
  

1. **TypeScript**  
    this project is based on [TypeScript](https://www.typescriptlang.org/).  
    we do not use ts-node in development due to file structure of the project,  
    you can refer to [package.json](./../package.json) "dev" script to know how to run the project in development.

2. **@vercel/ncc**  
    we use this package to compile the project into single file.  
    the project must be compiled to run as expected.  

    due to the single file design, working directory of the project will always be at "dist/".  