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
- [x] generate express app
    - [x] gen. openapi based on json schema
    - [x] gen. controllers based on openapi
        - [x] CRUD API
- [ ] database
    - [x] mongodb
    - [ ] sql
    - [ ] db encrtption [PDPA](https://en.wikipedia.org/wiki/Personal_Data_Protection_Act_2012)
- [ ] oauth2
    - [x] google
    - [ ] microsoft
    - [ ] github
- [x] Role Base Access Control
    - [x] API access control
    - [ ] data validation based on Role

## Enhancement To Do

- Implement data encryption & hash (PDPA)
    - at JsonSchmea fields, add attribute
    `x-dataSecure: "method"` while accessing data, perform encryption based on method selected.

