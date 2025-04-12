# Road Map

## Compatibility

- [ ] Dockernize

- [x] Generate App
    - [x] generate openapi based on json schema
    - [x] generate controllers based on openapi
        - [x] CRUD API
        - [x] data validation (express-validator)
    
- [ ] Database
    - [x] MongoDB
    - SQL **(ON HOLD)**

- [ ] OAuth2
    - [x] google
    - [ ] microsoft
    - [ ] github

## Features 

- [ ] Schema Definition
    - [x] App level foreign-key. `x-foreign-key` under properties  
        ```JSON
        {
            "username": {
                "type" : "string",
            },
            "contactId": {
                "type" : "string",
                "x-foreignKey" : "contact", // target collection's name
                "x-foreignValue" : [ // fields to join
                    "contactName",
                    "contactNumber",
                    "isActive"
                ]
            }
        }
        ```
- [x] REST API, to request data with foreign-key collection:  
    add field name as array into querystring "_join"
    example `/user?_join=["contact"]_select=["contactNo"]&`
    - [ ] DB field encryption. `x-encrypt`

- [x] Role Base Access Control
    - [x] API access control
    - different controller data validation rule by role **(ON HOLD)**
