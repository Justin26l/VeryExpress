# VeryExpress
this is a generator to make [Express](https://github.com/expressjs/express) REST API app based on [Json Schema](https://github.com/json-schema-org) and [Open Api](https://github.com/OAI) 
  
  
## Why?
bored on writing CRUD API time after time ?  
then this tool might save your time,  
all you need is define the **Json Schema** files.  
  
  
# Quick Start
1. install package globally.  
    ```npm i -g very-express```  
      
3. use cli to initialize configuration file **vex.config.json** under your project root directory.  
    `vex -init`  
      
2. create a empty directory and name it as value of vex.config's "jsonSchemaDir", by default `jsonSchema`.  
    `mkdir jsonSchema`.  
   
4. you can create your db collection/table now in directory `./jsonSchema` just created,  
    refer to [Define Json Schmea](./docs/vexJsonSchema.md),
    every changes require to regenerate app.
   
6. generate the app with vex.config param.  
    `vex`  
      
7. you should saw a express typescript app being generated (with src, package.json etc) .  
    ```
    ├── jsonSchema/  
    │   └── ...
    ├── src/ 
    │   └── ...
    ├── package.json  
    ├── tsconfig.json  
    ├── vex.config.json  
    └── .env  
    ```  
      
8. start the generated express app.  
    ```
    npm i  
    npm build    
    npm run start
    ```

# Feature Supported
- generate REST API server
- API Validator by [express-validator](https://express-validator.github.io/docs/)
- generate OpenApi
- [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express)
- OAuth by [Passport.js](https://www.passportjs.org/)
- Database Driver
  - MongoDB by [Mongoose](https://mongoosejs.com/)

# Resource
- [Documents](./docs/)
- [Road Map](./docs/roadMap/)
- [ReleaseNote](./docs/releaseNote)

- [Discord](https://discord.gg/PZGMzDp7)
