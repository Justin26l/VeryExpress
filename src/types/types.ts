export interface VexFileMeta {
    lastWriteVersion: string;
    allowOverwrite: boolean;
}

export interface VexMeta {
    lastGeneratedVersion?: string;
    files: { [relPath: string]: VexFileMeta };
}

export interface compilerOptions {
    jsonSchemaDir: string,
    openapiDir: string,
    rootDir: string,
    srcDir: string,
    sysDir: string,

    generator: {
        commitBeforeGenerate: boolean;
    },
    // database target type: 'sql' (TypeORM/PostgreSQL) or 'mongo' (Mongoose/MongoDB)
    dbType?: "sql" | "mongo",

    app: {
        enableSwagger: boolean,
        useUserSchema: boolean,
        allowApiCreateUpdate_id: boolean,
        useStatefulRedisAuth: boolean,
        /**
         * Adapter-layer visibility policy for soft-deleted rows.
         *
         * Unset/false → the repository hides rows whose soft-delete marker is set
         * (`x-vexData: "softDelete"`). `true` disables that filter app-wide, making tombstones
         * visible — and therefore writable — through ordinary queries again.
         *
         * Generation-time constant: it is baked into `VexFieldRegistry.gen.ts`, so no request can
         * flip it. See docs/features/accountDeletion.md.
         */
        showSoftDeleted?: boolean,
    },

    useRBAC?: {
        roles: string[]
        default: string,
    },

    /**
     * Tenant isolation. `enable` is the switch; `IsolationMode` decides how a request gets
     * its tenant. A document opts in with an isolation rule whose `source` is
     * `"user.tenantId"`.
     *
     * See docs/features/tenantIsolation.md.
     */
    tenant?: TenantConfig,

    auth:{
        localAuth: boolean,
        useHttpOnlyCookieToken?: boolean,
        oauthProviders?: {
            google?: boolean,
            microsoft?: boolean,
            apple?: boolean,
            github?: boolean,
            [key: string]: boolean | undefined;
        };
        /**
         * Self-service account deletion (`POST /api/auth/delete-account`) and the
         * `/delete_account` page. Defaults to true; the feature additionally requires auth to be
         * enabled. The object form adds `deleteTables`, the documents whose rows are removed with
         * the account. See docs/features/accountDeletion.md.
         */
        deleteAccount?: boolean | DeleteAccountConfig,
        /**
         * Firebase as a sign-in option: `POST /api/auth/firebase`, and the button that drives it on the
         * generated `/login` page. Defaults to false — it is the one feature that lets an outside
         * identity provider mint a vex session.
         *
         * This boolean is the **only** switch. Everything else is a deployment concern and lives in the
         * environment: the service account (`FIREBASE_SERVICE_ACCOUNT_JSON`), Firebase's public web
         * config (`FIREBASE_WEB_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`) and, optionally, which
         * providers the page offers (`FIREBASE_PROVIDERS`). There is no `appId`: Firebase Auth does
         * not read one.
         *
         * The identity written is the **upstream** IdP's: `("google", <Google sub>)` for a Google
         * sign-in. See docs/plan/spec-firebase-auth.md.
         */
        firebase?: boolean,
    },

    _: {
        writtedDir: string[],
    },
}

export interface roleJson {
    [key: string]: string[];
}

export enum DbRelationType {
    OneToOne = "one-to-one",
    OneToMany = "one-to-many",
    ManyToOne = "many-to-one",
}

export enum xVexDataType {
    Role = "role",
    /** marks the field that holds the identity value stored in audit fields (createdBy / updatedBy) */
    UserId = "userId",
    /**
     * Marks the boolean field that carries an entity's soft-delete state. One per document.
     * The repository hides rows whose marker is set unless `app.showSoftDeleted` is on.
     */
    SoftDelete = "softDelete",
}

export enum xFormatType {
    Primary = "Primary",
    PrimaryUUID = "PrimaryUUID",
    UUID = "UUID",
    ObjectId = "ObjectId",
    UnixTimestamp = "UnixTimestamp",
    /** ISO-8601 datetime column (SQL: timestamptz) */
    Timestamp = "Timestamp",
    /** Binary payload (SQL: bytea). The API contract is a base64 string. */
    Binary = "Binary",
}

/**
 * Reserved `default` values. A field declared with one of these is filled by the
 * DB layer on the write paths instead of by the client — see docs/features/auditFields.md.
 */
export enum vexDefaultKeyword {
    OnCreateTimestamp = "onCreateTimestamp",
    OnCreateUnixTimestamp = "onCreateUnixTimestamp",
    OnUpdateTimestamp = "onUpdateTimestamp",
    OnUpdateUnixTimestamp = "onUpdateUnixTimestamp",
    OnCreateUserId = "onCreateUserId",
    OnUpdateUserId = "onUpdateUserId",
}

export interface jsonSchema {
    type: string;
    "x-documentConfig": documentConfig;
    properties: {
        [key: string]: jsonSchemaPropsItem;
    };
    required?: string[];
    index?: string[];
    interface?: {
        fkProps: fkProps[];
    };
    [key: string]: any;
}

export interface fkProps {
    propName: string;
    interfaceName: string;
    relationType: DbRelationType;
    imports: string[];
}

export interface foreignKeyConfig {
    schemaName: string;
    fieldName: string;
    relationType: DbRelationType;
}

export interface jsonSchemaPropsItem {
    type: string;
    description?: string;
    format?: string;
    properties?: { 
        [key: string]: jsonSchemaPropsItem;
    };
    items?: jsonSchemaPropsItem;
    enum?: string[];
    required?: boolean | string[];
    index?: boolean;
    unique?: string[];
    example?: any;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    "x-vexData"?: xVexDataType | string;
    "x-format"?: xFormatType | string;
    "x-foreignKey"?: foreignKeyConfig;
    /** For decimal columns: total significant digits (maps to TypeORM precision & scale) */
    precision?: number;
    scale?: number;
    [key: string]: string | boolean | number | string[] | jsonSchemaPropsItem | foreignKeyConfig | { [key: string]: jsonSchemaPropsItem;} | any[] | undefined;
}

export interface populateOptions { 
    [key: string]: string,
}

/** Where an isolation value comes from at request time. */
export type IsolationSource = "user._id" | "user.tenantId";

/** What the repository does when the rule resolves to no value. */
export type IsolationOnMissing = "skip" | "deny";

/**
 * One query term the repository adds to every read and write of a document.
 *
 * `field` is the document column; `source` picks the request-context value.
 */
export interface IsolationRule {
    field: string;
    source: IsolationSource;
    onMissing: IsolationOnMissing;
}

/** Legacy single-rule form. Normalized to `isolation` by the isolation preprocessor. */
export interface DataIsolationConfig {
    field: string;
}

/**
 * `preSelect` — the tenant is chosen before login (one app build per tenant). Every request
 * must carry the tenant header.
 * `option` — the user logs in first, then selects a tenant. The tenant travels in the token.
 */
export type TenantIsolationMode = "preSelect" | "option";

export interface TenantConfig {
    enable: boolean;
    /** Defaults to `preSelect`. */
    IsolationMode?: TenantIsolationMode;
    /** Path prefixes the tenant middleware applies to. Omitted = every route. */
    scope?: string[];
}

/** Account-deletion behaviour beyond the identity tombstone. */
export interface DeleteAccountConfig {
    /** Defaults to true. `false` disables the endpoint and the page. */
    enabled?: boolean;
    /** Document names whose rows linked to the deleted user are removed with the account. */
    deleteTables?: string[];
}

export interface documentConfig {
    documentName: string;
    keyPrefix?: string;
    uniqueIndex?: string[][];
    restApi: {
        methods: schemaMethod[];
        joinWhitelist?: string[];
        noRelations?: boolean;
    };
    /** Legacy single-field form; kept as input and normalized into `isolation`. */
    dataIsolation?: DataIsolationConfig;
    /** Current form. Every rule is ANDed into the repository filter. */
    isolation?: IsolationRule[];
}

/**
 * fieldsName : fieldsType
 */
export interface removeKeyObj {
    [key: string]: string;
}

/** method key allowed in json schema, httpMethod with extra "getList" */
export type schemaMethod = "get" | "getList" | "post" | "put" | "patch" | "delete" ;

export const schemaMethodArr : schemaMethod[] = [ "get", "getList", "post", "put", "patch", "delete"];

/** schemaMethod without "getList" */
export type httpMethod = "get" | "post" | "put" | "patch" | "delete" ;
export const httpMethodArr : httpMethod[] = [ "get", "post", "put", "patch", "delete"];
