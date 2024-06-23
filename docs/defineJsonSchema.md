# Define Json Schema
### x-documentConfig: 

| Fields | Data Type | Options | Description | 
| - | - | - | - | 
| documentName  | `string` | - | name of **collection** or **table**, also used at `Model`, camel case recomended.  | 
| interfaceName | `string` | - | use to name `endpoint`, `Class`, `Interface`, `File`. | 
| methods | `array<string>` | `get`, `post`, `put`, `patch`, `delete` | available method of REST API. |


### Properties Mandatory Value: 

| Fields | Data Type | Required | Description | 
| - | - | - | - | 
| type | `string` | true | [JsonSchema's type field](https://json-schema.org/understanding-json-schema/reference/type) |
| required | `boolean` | false | api will check field must be defined. |
| x-foreignKey | `string` | false | `documentName` from other JsonSchema, plan to implemented on [v0.5.0](./RoadMap/v0-5-0.md) |
<!-- | format | `string` | false | veryExpress did not handle this field | -->

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