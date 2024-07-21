# Development Note
- "Project" or "The Project" is refer to this package which named "VeryExpress", github repository "[Justin26l/VeryExpress](https://github.com/Justin26l/VeryExpress)", npm package "[very-express](https://www.npmjs.com/package/very-express)".  
  
- "Package" is refer to one of the node module, npm package, third-party library.  
  

1. **TypeScript**  
    this project is based on [TypeScript](https://www.typescriptlang.org/).  
    we do not use ts-node in development due to file structure of the project,  
    you can refer to [package.json](./../package.json) "dev" script to know how to run the project in development.

2. **Esbuild**  
    the project require to compile into bundle to run.  
    due to the single file design, working directory of the project will always be at "dist/".  
    refer to [package.json](./../package.json) `scripts > compile`.  

3. **File Generate Template**  
    if there is any function calling pass by object need to be write in file output,  
    use syntax: `FUNC{{ <myFunc(){...}> }}`.  
    refer to :  
    1. [controller custom validatior](./../src/generators/controller/controllers.generator.ts#L<202>)  
    2. [controller template return](./../src/generators/controller/controller.template.ts#L<246>)  
    3. [template formatter function](./../src/utils/template.ts#L<6>)