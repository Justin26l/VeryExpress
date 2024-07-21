# Define Json Schema for VeryExpress

## x-documentConfig: 

| Fields | Data Type | Options | Description | 
| - | - | - | - | 
| documentName  | `string` | - | auto generated using file name. used to name **Collection**, **TS Interface**, **ODM Model** etc. | 
| methods | `array<string>` | `get`, `post`, `put`, `patch`, `delete` | array of **REST API Method**  to be enable. |


## Properties Definition: 

| Fields | Data Type | Required | options | Description | 
| - | - | - | - | - | 
| type | `string` | true | - | [JsonSchema's type field](https://json-schema.org/understanding-json-schema/reference/type) |
| required | `boolean` | false | - | rest api's validator will check value cannot be falsy / undefined. |
| x-vexData | `string` | false | `primaryKey`, `role` | determine veryExpress generation process. |
| x-foreignKey | - | - | - | `documentName` from other JsonSchema, auto index. plan to implemented on [v0.5.0](./RoadMap/v0-5-0.md) |
<!-- | format | `string` | false | - | veryExpress did not handle this field | -->

### System Fields
which mean there field properties is not changable.  
- `_id` : if defined in schema, will auto set as `"index": true`, `"x-vexData": "ObjectId"`.  


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