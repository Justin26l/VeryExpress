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

- [x] REST API, to request data with foreign-key collection:  
    add field name as array into querystring "join"
    example `/user?join=["contact"]&select=["contactNo"]`

- [x] Role Base Access Control
    - [x] API access control
    
- [x] [tsoa](https://tsoa-community.github.io/docs/) make it nextjs like and support opanapi with custom endpoint (non generated).
