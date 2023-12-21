# VeryExpress
a generator that generate [Express](https://expressjs.com/) rest-api app from [JsonSchema](https://json-schema.org/overview/what-is-jsonschema) and [OpenApi](https://www.openapis.org/) spec.

## Related Project
- [x] [json2mongoose](https://github.com/Justin26l/json2mongoose) - jsonSchema to Mongoose Model.
- [ ] Front-End UI Generator

## Idea
doing same things once is good,  
twice is okay, third is wasting life.

all you need is define the `JsonSchema` and modify the `OpenApi` spec it generate.

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
    - [ ] [OAuth](https://oauth.net/) Middleware
    - [ ] [RBAC](https://en.wikipedia.org/wiki/Role-based_access_control) Middleware
- [x] gen. routes
- [x] gen. controllers based on openapi spec
    - [ ] define fields filtering method
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

