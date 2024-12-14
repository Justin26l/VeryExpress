# Auth
- Stateless JWT token
  - **Rolling Keys**  
    define in `.env`,  
    named `JWT_KEY{increment}`  
    ```bash
      JWT_KEY1=aaaaa
      JWT_KEY2=bbbbb
      JWT_KEY3=ccccc
    ```
  - **OAuth2**  
    Supported Providers:
    - Google
    - Github  
    
    define in `.env`,  
    named `OAUTH_{provider}_CLIENTID` & `OAUTH_{provider}_CLIENTSECRET`    
    ```bash
      OAUTH_GOOGLE_CLIENTID=xxxxx
      OAUTH_GOOGLE_CLIENTSECRET=xxxxx
    ```
- Stated
  - not yet implement