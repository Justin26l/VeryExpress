# v0.5.0 - Foreign-key & REST API

### Define Foreign-key  
add attribute at JsonSchmea's field props, `x-foreignKey: "targetCollectionName"`

Example:  
- **User Collection's**  field "contactId" as foreign-key of **Contact Collection**
    ```JSON
    {
        "username": {
            "type" : "string",
            ...
        },
        "contactId": {
            "type" : "string",
            "x-foreignKey" : "contact"
        }
    }
    ```
### REST API Foreign-key supports

| Methods | Param | Type | Mandatory | Description |
| ------- | ----- | ---- | --------- | ----------- |
| GET | _join | QueryString `array<String>` | false | join collection using **Current Resource's Field Name**. target joined collection decleare by `x-forignKey` |
| GET | _select | QueryString `array<String>` | false | work with `_join`, select fields to join for target collection. empty = select all.  |

**Example :**  
`/user?_join=["contact"]&_select=["contactName","contactNumber"]`
  

**Output:** 
```JSON
{
    "username": "justin",
    "contactId": {
        "contactName": "justin's mobile",
        "contactNumber": 1122333445566
    }
}

