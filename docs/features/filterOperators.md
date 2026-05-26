# Filter Query Operators

The `/search` endpoint accepts a `filter` object with MongoDB-like operators. Supported for both SQL (TypeORM adapter) and planned for Mongo (Mongoose adapter).

## Operators

| Operator | Type | Description | SQL Translation |
|----------|------|-------------|-----------------|
| `$in` | `string[] \| number[]` | Value in list | `IN (...)` |
| `$nin` | `string[] \| number[]` | Value not in list | `NOT IN (...)` |
| `$gt` | `number \| string` | Greater than | `> ` |
| `$gte` | `number \| string` | Greater than or equal | `>=` |
| `$lt` | `number \| string` | Less than | `<` |
| `$lte` | `number \| string` | Less than or equal | `<=` |
| `$like` | `string` | Pattern match | `LIKE` |
| `$raw` | `string` | Raw SQL expression | Passed through verbatim |

## Logical operators

| Operator | Type | Description |
|----------|------|-------------|
| `$and` | `Filter[]` | All conditions must match |
| `$or` | `Filter[]` | Any condition must match |

## Examples

```jsonc
// Equality
{ "filter": { "status": "active" } }

// Comparison
{ "filter": { "age": { "$gte": 18, "$lte": 65 } } }

// Pattern match
{ "filter": { "email": { "$like": "%@example.com" } } }

// List membership
{ "filter": { "role": { "$in": ["admin", "moderator"] } } }

// Combined
{ 
    "filter": { 
        "$and": [
            { "status": "active" },
            { "age": { "$gte": 18 } }
        ],
        "$or": [
            { "role": "admin" },
            { "permissions": { "$like": "%manage%" } }
        ]
    }
}
```

## TypeORM safety

- `$raw` is passed directly as a TypeORM `FindOptions` raw where — use with caution (SQL injection risk if user-supplied)
- `$like` value is passed as-is; caller must escape `%` and `_` if needed
- All other operators are parameterized via TypeORM's `FindOptionsWhere`
