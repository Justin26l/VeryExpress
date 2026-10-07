# Foreign-key
- Avalilable from v0.5.x
- Api level collection joining

## Define Foreign-key  
Add attribute at JsonSchmea's field props, `x-foreignKey: "targetCollectionName"`

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
# REST API 
## Parameters
### HTTP GET :
| Param | Type | Mandatory | Description |
| ----- | ---- | --------- | ----------- |
| join | QueryString `array<String>` | false | join collection using **Current Resource's Field Name**. target joined collection decleare by `x-forignKey` |
| select | QueryString `array<String>` | false | work with `join`, select fields to join for target collection. empty = select all.  |

## Example 
`/user?join=["contact"]&select=["contactName","contactNumber"]`
  

**Output:** 
```JSON
{
    "username": "justin",
    "contact": {
        "contactName": "justin's mobile",
        "contactNumber": 1122333445566
    }
}

