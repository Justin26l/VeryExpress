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
         * enabled. See docs/features/accountDeletion.md.
         */
        deleteAccount?: boolean,
        /**
         * External identity (broker SSO): `POST /api/auth/external` accepts an ID token issued by a
         * configured broker, verifies it against the issuer's JWKS, and provisions the matching vex
         * identity. Defaults to false — vex adds no vendor dependency until a project asks for one.
         * See docs/plan/vex-external-identity.md.
         */
        externalIdentity?: externalIdentityOptions,
    },

    _: {
        writtedDir: string[],
    },
}

/**
 * Broker SSO settings.
 *
 * Either name a `preset` and supply the variables it declares, or configure the issuer explicitly.
 * Explicit keys always win over the preset, so a project can start from one and adjust a field.
 */
export interface externalIdentityOptions {
    enabled?: boolean,
    /** Built-in settings for a known broker. */
    preset?: string,
    /** Preset variables, e.g. `projectId` for Firebase. */
    [key: string]: unknown,
    /** Token issuer, exact string, pinned in config — never taken from the token. */
    issuer?: string,
    /** Explicit JWKS URL. When absent and `discovery` is on, it is resolved from the issuer. */
    jwksUrl?: string | null,
    /** Resolve `jwksUrl` from `issuer/.well-known/openid-configuration` at runtime. */
    discovery?: boolean,
    /** Expected `aud` (or `audienceClaim`) value. Omit only for tokens that carry none. */
    audience?: string,
    /** Which claim carries the audience: `aud` (default) or `client_id`. */
    audienceClaim?: string,
    /** Signature algorithms accepted. Asymmetric only — `HS*` is rejected at generation. */
    algorithms?: string[],
    /**
     * Which layer supplies both `provider` and `providerUserId`: `broker` (the issuer's own subject)
     * or `upstream` (the federated IdP's subject). `auto` picks upstream when the login carries one.
     * The two halves always move together, so a pair can never be incoherent.
     */
    identityLayer?: "auto" | "broker" | "upstream",
    /** Used when the resolved layer is `broker`. Defaults to the preset's label. */
    providerLabel?: string,
    /** Claim paths, dot-separated. `username` is an ordered fallback list. */
    claims?: {
        id?: string,
        email?: string,
        emailVerified?: string,
        username?: string[],
    },
    /** What to do when the token carries no email: refuse the login, or write a placeholder. */
    onMissingEmail?: "reject" | "synthesize",
    /**
     * How the generated login page signs a browser in. The server-side flow is identical either way.
     *
     * `popup` (default) is what Google recommends on browsers that block third-party storage access:
     * the pending-sign-in state lives in *this* page's first-party storage.
     *
     * `redirect` navigates the whole page instead. It avoids popup blockers, but it does **not** avoid
     * the storage restriction — the state has to be handed back through the broker's origin, and when
     * that is blocked the flow fails with "missing initial state". Making redirect first-party needs the
     * broker's sign-in helper served from your own domain. See the release note.
     */
    signInMethod?: "popup" | "redirect",
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

export interface DataIsolationConfig {
    field: string;
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
    dataIsolation?: DataIsolationConfig;
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
