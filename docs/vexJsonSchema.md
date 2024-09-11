# Define Json Schema for VeryExpress

## x-documentConfig: 

| Fields | Data Type | Options | Description | 
| - | - | - | - | 
| documentName  | `string` | - | auto generated using file name. this value should be same as the collection name, it will used to name **Collection**, **TS Interface**, **ODM Model** etc. | 
| methods | `array<string>` | `get`, `post`, `put`, `patch`, `delete` | array of **REST API Method**  to be enable. |


## Properties Definition: 

| Fields | Data Type | Required | options | Description | 
| - | - | - | - | - | 
| type | `string` | true | - | [JsonSchema's type field](https://json-schema.org/understanding-json-schema/reference/type) |
| required | `boolean` | false | - | rest api's validator will check value cannot be falsy / undefined. |
| x-vexData | `string` | false | `primaryKey`, `role` | determine veryExpress generation process. |
| x-foreignKey | `string` | false | - | `documentName` from other JsonSchema, auto indexed, use to join collection |
| x-foreignValue | `array<String>` | false | - | default selected fields for target  collection |
<!-- | format | `string` | false | - | veryExpress did not handle this field | -->

### System Fields
System Fields is the properties to let generator run as expected,it should not be changed.  
- `_id` : if defined in schema, it will auto being set as `"index": true`, `"x-vexData": "ObjectId"`.  


#### Example : 
```JSON
{
    "x-documentConfig": {
        "documentName": "user", // auto generated using name
        "methods": [ 
            "get",
            "post",
            "put",
            "patch",
            "delete"
        ]
    },
    "properties": {
        "_id": {
            "type": "string",
            "index": true,
            "x-vexData": "ObjectId"
        },
        "username": {
            "type": "string"
        },
        "invoice_id": {
            "type": "string",
            "required": true,
            "x-foreignKey": "invoice"
        }
    }
}
```