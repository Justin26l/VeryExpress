# VeryExpress
an generator that generate [Express](https://github.com/expressjs/express) rest-api app based on [jsonSchema](https://github.com/json-schema-org) and [openApi](https://github.com/OAI) 

## Idea
doing same things once is good,  
twice is okay, third times is wasting life.

all you need is define the `JsonSchema` and `openApi` spec

# Quick Start
1. create JsonSchmea, can refer to output/jsonSchema put it as cli config file
2. `npm i -g very-express`  
    install package globally
3. `vex -h`  
    this cmd create the cli config file
4. `vex `  
    call cli with vex.config.json setting  
5. `npm i`
6. `npm build`
7. `npm run start`

## JsonSchmea Setup
at the root of schema :

| Fields | Description | 
| - | - | 
| documentName  | name of **collection** or **table**, also used at `Model`. | 
| interfaceName  | used at endpoint and naming `Class`, `Interface`, `Files`. | 
| methods | available method of rest api. |


    "x-documentConfig": {
        "documentName": "user",
        "interfaceName": "User",
        "methods": [
            "get",
            "post",
            "put",
            "patch",
            "delete"
        ]
    }

at the properites :

    "userContact":{
        "type": "string",
        "format": "uuid",
        "required": false,
        "x-foreignKey": "usercontact"
    }



## Road Map
- [ ] dockernize
- [x] generate express server 
- [x] gen. routes
- [x] gen. controllers based on openapi spec
    - [ ] define fields searching method
- [x] gen. openapi based on json schema
- [x] gen. mongoose model
- [ ] gen. sql model
- [ ] database connection
    - [ ] implement sensitive data encryption & hash (PDPA)
- [x] TS interface based on json schema

## Enhancement To Do
- avoid mongo `_id` , instead using custom index `id` for db compatibilities,
    - at JsonSchmea.x-documentConfig, add fields  
    `index: string` point to index fields,  
    `indexPrefix: string` for easier to identify if its is a foreignKey value.

- Implement data encryption & hash (PDPA)
    - at JsonSchmea.Properties, add attribute
    `x-dataSecure: sting` while accessing data, perform hash or encryption.

- `* TBC *` Controller > define fields searching method 
    - at JsonSchmea.x-Properties, add attribute  
    `x-filterType: obejct` method will be array of [ "equal", "like", "between", "gratherThan", "smallerThen" ] default "equal" :

            "date":{
                "type": "string",
                "format": "date-time",

                "x-filterType": {
                    method : "between",
                    from : 'startDate', // additinal fields at openapi /get
                    to : 'endDate', // additinal fields at openapi /get
                },

                "x-filterType": {
                    method : "like",
                },
            }

