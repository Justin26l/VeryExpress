# Define Json Schema
this document tell how very express process the json schema.
### x-documentConfig: 

| Fields | Data Type | Options | Description | 
| - | - | - | - | 
| documentName  | `string` | - | auto generated as file name. used to name **Collection**, **TS Interface**, **ODM Model** etc. | 
| methods | `array<string>` | `get`, `post`, `put`, `patch`, `delete` | array of **REST API Method**  to be generated. |


### Properties Mandatory Value: 

| Fields | Data Type | Required | Description | 
| - | - | - | - | 
| type | `string` | true | [JsonSchema's type field](https://json-schema.org/understanding-json-schema/reference/type) |
| required | `boolean` | false | value cannot be falsy / undefined. |
| x-foreignKey | `string` | false | `documentName` from other JsonSchema, auto index. plan to implemented on [v0.5.0](./RoadMap/v0-5-0.md) |
<!-- | format | `string` | false | veryExpress did not handle this field | -->

```JSON
{
    "x-documentConfig": {
        "documentName": "user", // auto generate as file name
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