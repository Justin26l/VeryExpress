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
    - [ ] App level foreign-key. `x-foreign-key`
    - [ ] DB field encryption. `x-encrypt`

- [x] Role Base Access Control
    - [x] API access control
    - different controller data validation rule by role **(ON HOLD)**
