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
x-documentConfig: 

| Fields | Description | 
| - | - | 
| documentName  | name of **collection** or **table**, also used at `Model`. | 
| interfaceName  | used at endpoint and naming `Class`, `Interface`, `Files`. | 
| methods | available method of rest api. |

```JSON
{
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
    },
    "properties": {
        "invoiceId": {
            "type": "string",
            "format": "uuid",
            "required": false,
            "x-foreignKey": "invoice"
        }
    }
}
```

## Road Map
- [ ] dockernize
- [ ] Schema Definition
    - [ ] data join
    - [ ] data encryption (PDPA)
- [x] generate express app
    - [x] gen. openapi based on json schema
    - [x] gen. controllers based on openapi
        - [x] CRUD API
- [ ] database support
    - [x] mongodb
    - [ ] ~sql~
- [ ] oauth2 Implement
    - [x] google
    - [ ] microsoft
    - [ ] github
- [x] Role Base Access Control
    - [x] API access control
    - [ ] data validation based on Role

# To Do

- data join
    - at JsonSchmea fields, add attribute
    `x-foreignKey: "collectionName"` use this column value to math with target collection "_id" fields.
    ```JSON
    {
         "invoiceId": {
            "type" : "string",
            "x-foreignKey" : "invoice"
        },
         "orderId": {
            "type" : "string",
            "x-foreignKey" : "order"
        }
    }
    ```
    - at REST API, to query with join:  
        add field name as stringified array into querystring "join"
        example `/myDataApi?join=[invoiceId,orderId]`

- data encryption
    - at JsonSchmea fields, add attribute
    `x-dataSecure: "SHA256/MD5/..."` while accessing data, perform encryption based on method selected.


