# API Usage Guide

## Pagination

`POST /{resource}/search` Endpoint supportable selection number. 

### Request

```json
POST /api/job/search
{ 
    "filter": { "status": "active" }, 
    "pagination": { 
        "page": 1, 
        "perPage": 20, 
        "sort": { "createdAt": "DESC" } 
    }
}
```

| Character | Category | Required | Explanation |
|------|------|------|------|
| `pagination.page` | number | no |
| `pagination.perPage` | number | no | number per page, default 20 |
| `pagination.sort` | object | no | `{ fieldName: "ASC" \| "DESC" }` |

### Response

**with `pagination`**

```json
{ 
    "ret_code": 200, 
    "result": { 
        "data": [ 
            { "id": "abc", "status": "active", ... } 
        ], 
        "total": 142, 
        "page": 1, 
        "perPage": 20 
    }
}
```

**without `pagination`**

```json
{ 
    "ret_code": 200, 
    "result": [ 
        { "id": "abc", "status": "active", ... },
        {...}
    ]
}
````

### Default Limits

without pagination, search api set row limit 500 as safety upper limit. 
with pagination row limit will follow `perPage`, cap at 9999.