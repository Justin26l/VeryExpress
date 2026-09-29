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
  - **External identity (broker SSO)** — off by default
    - `POST /auth/external` takes an ID token from a broker (Firebase), verifies it against the
      issuer's JWKS, and provisions the vex identity. The broker's token is consumed there and never
      stored; the reply is the usual session-code redirect, so `POST /auth/token` still mints every
      token.
    - The generated login page renders the broker's buttons; the broker's SDK comes from the npm
      package, served same-origin.
    - **Prefer a broker that exposes the upstream IdP's subject — Firebase or Cognito.** Those produce
      `("google", <Google sub>)`, the same key the passport flow writes. A broker that cannot (Keycloak,
      Okta) only yields one broker-labelled row, so the UI shows the broker's name instead of the
      provider the user actually picked.
    - Config, identity layers, `signInMethod`, troubleshooting:
      [`docs/features/externalIdentity.md`](../features/externalIdentity.md).