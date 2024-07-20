# Define Json Schema
this document tell how very express process the json schema.
### x-documentConfig: 

| Fields | Data Type | Options | Description | 
| - | - | - | - | 
| documentName  | `string` | - | auto generated using file name. used to name **Collection**, **TS Interface**, **ODM Model** etc. | 
| methods | `array<string>` | `get`, `post`, `put`, `patch`, `delete` | array of **REST API Method**  to be enable. |


### Properties Definition: 

| Fields | Data Type | Required | options | Description | 
| - | - | - | - | - | 
| type | `string` | true | - | [JsonSchema's type field](https://json-schema.org/understanding-json-schema/reference/type) |
| required | `boolean` | false | - | rest api's validator will check value cannot be falsy / undefined. |
| x-vexData | `string` | false | `role` | determine veryExpress generation process. |
| x-foreignKey | - | - | - | `documentName` from other JsonSchema, auto index. plan to implemented on [v0.5.0](./RoadMap/v0-5-0.md) |
<!-- | format | `string` | false | - | veryExpress did not handle this field | -->

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
        "invoice_id": {
            "type": "string",
            "required": true,
            "x-foreignKey": "invoice"
        }
    }
}
```