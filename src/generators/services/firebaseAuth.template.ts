/**
 * Source builders for the Firebase sign-in runtime: 
 * 
 *   _services/auth/FirebaseAdmin.gen.ts        - the project credential, read from the environment
 *   _services/auth/FirebaseAuthService.gen.ts  - verify, resolve the upstream identity, provision the user
 *   _routes/FirebaseAuthUI.gen.ts              - what the login page needs to drive the browser SDK
 *
 * Emitted source must avoid backticks and `${` — it is interpolated into template literals here.
 */

/** `_services/auth/FirebaseAdmin.gen.ts` — the service account, read once at module scope. */
export function adminModule(): string {
    return `// {{headerComment}}
import { initializeApp, cert, getApps, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import utils from "../../_utils";

/** The project credential, from FIREBASE_SERVICE_ACCOUNT_JSON. Absent or unusable -> 503, not a crash. */
function readServiceAccountField(source: object, camel: string, snake: string): string | undefined {
    const camelValue: unknown = Reflect.get(source, camel);
    if (typeof camelValue === "string" && camelValue.length > 0) return camelValue;

    const snakeValue: unknown = Reflect.get(source, snake);
    return typeof snakeValue === "string" && snakeValue.length > 0 ? snakeValue : undefined;
}

/** Normalise a parsed blob to the shape cert() expects, or null when it is not a service account. */
function toServiceAccount(value: unknown): ServiceAccount | null {
    if (typeof value !== "object" || value === null) return null;

    const projectId = readServiceAccountField(value, "projectId", "project_id");
    const privateKey = readServiceAccountField(value, "privateKey", "private_key");
    const clientEmail = readServiceAccountField(value, "clientEmail", "client_email");
    if (!projectId || !privateKey || !clientEmail) return null;

    return { projectId, privateKey, clientEmail };
}

function loadServiceAccount(): ServiceAccount | null {
    const source = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!source) {
        utils.log.warn(
            "Firebase: FIREBASE_SERVICE_ACCOUNT_JSON is not set. POST /api/auth/firebase will answer " +
            "503. Paste the service account JSON (Firebase console: Project settings > Service " +
            "accounts > Generate new private key) as the value."
        );
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(source);
    }
    catch {
        utils.log.warn("Firebase: FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
        return null;
    }

    const account = toServiceAccount(parsed);
    if (!account) {
        utils.log.warn(
            "Firebase: FIREBASE_SERVICE_ACCOUNT_JSON is not a service account - project_id, " +
            "private_key and client_email are all required. Generate one in the Firebase console: " +
            "Project settings > Service accounts > Generate new private key."
        );
        return null;
    }

    return account;
}

/**
 * Initialised once, at module load.
 *
 * Reading the credential here rather than per request means a bad secret is reported immediately
 * instead of on the first sign-in attempt. Changing it therefore needs a process restart.
 */
if (!getApps().length) {
    const serviceAccount = loadServiceAccount();
    if (serviceAccount) initializeApp({ credential: cert(serviceAccount) });
}

export const isFirebaseAvailable: boolean = getApps().length > 0;

/** null when no usable credential was found; the endpoint reports 503 rather than guessing. */
export const firebaseAuth: Auth | null = isFirebaseAvailable ? getAuth() : null;
`;
}

/**
 * `_services/auth/FirebaseAuthService.gen.ts` — verify, resolve the identity, find or create the user.
 *
 * Writes the same `(provider, providerUserId)` pair as `OAuthStrategyService`, plus the RBAC default
 * role when RBAC is on.
 */
export function serviceModule(options: { rbac: boolean; defaultRole: string }): string {
    const rbacImports = options.rbac
        ? "\nimport { UserRoleEntity, UserRole } from \"../../_models/UserRoleModel.gen\";\nimport { RoleEnum } from \"../../_types/UserRole.gen\";"
        : "";
    const userRoleRepo = options.rbac
        ? "\n    private get userRoleRepo(): VexRepository<UserRole> { return VexDb.getRepository(UserRoleEntity); }"
        : "";
    const assignRole = options.rbac
        ? `
        await this.userRoleRepo.create({ userId: created._id, role: RoleEnum.${options.defaultRole} })
            .catch(async () => {
                await this.userRepo.delete(created._id);
                await this.uapRepo.deleteWhere({ userId: created._id });
                throw new VexResErr(500, null, "User role assignment failed.");
            });
`
        : "";

    return `// {{headerComment}}
import { DecodedIdToken } from "firebase-admin/auth";
import { UserEntity, UserWithRelations } from "../../_models/UserModel.gen";
import { UserAuthProfilesEntity, UserAuthProfiles } from "../../_models/UserAuthProfilesModel.gen";
import { VexRepository, VexResErr } from "../../_types/vex";
import { entitySoftDeleteFields } from "../../_middlewares/VexFieldRegistry.gen";
import { firebaseAuth, isFirebaseAvailable } from "./FirebaseAdmin.gen";
import VexDb from "../VexDb.gen";
import utils from "../../_utils";${rbacImports}

export interface resolvedIdentity {
    provider: string;
    providerUserId: string;
}

export interface firebaseLoginResult {
    user: UserWithRelations;
    identity: resolvedIdentity;
    isNewUser: boolean;
}

/** firebase.sign_in_provider -> the provider label the passport strategies write. */
const providerMap: Record<string, string> = {
    "google.com": "google",
    "github.com": "github",
    "apple.com": "apple",
    "microsoft.com": "microsoft",
};

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** The upstream subject; identities is typed any, so it is erased to unknown before reading. */
function readUpstreamSubject(decoded: DecodedIdToken, signInProvider: string): string | undefined {
    const identities: unknown = decoded.firebase.identities;
    if (typeof identities !== "object" || identities === null) return undefined;

    const subjects: unknown = Reflect.get(identities, signInProvider);
    if (!Array.isArray(subjects)) return undefined;

    const first: unknown = subjects[0];
    return typeof first === "string" && first.length > 0 ? first : undefined;
}

export default class FirebaseAuthService {

    private get userRepo(): VexRepository<UserWithRelations> {
        return VexDb.getRepository<UserWithRelations>(UserEntity);
    }

    private get uapRepo(): VexRepository<UserAuthProfiles> {
        return VexDb.getRepository<UserAuthProfiles>(UserAuthProfilesEntity);
    }${userRoleRepo}

    /** Verify the ID token, then find or create the user it names. */
    public async authenticate(idToken: string): Promise<firebaseLoginResult> {
        const decoded = await this.verify(idToken);
        const identity = this.resolveIdentity(decoded);

        const email = decoded.email;
        const username = decoded.name ?? email ?? identity.providerUserId;

        const existing = await this.findExisting(identity, email, decoded.email_verified === true);
        if (existing) {
            await this.attachProfile(existing, identity, username);
            return { user: existing, identity, isNewUser: false };
        }

        return { user: await this.createUser(identity, username, email), identity, isNewUser: true };
    }

    /** firebase-admin checks signature, issuer, audience and expiry. */
    public async verify(idToken: string): Promise<DecodedIdToken> {
        if (!isFirebaseAvailable || !firebaseAuth) {
            throw new VexResErr(503, null, "Firebase authentication is not configured");
        }

        try {
            return await firebaseAuth.verifyIdToken(idToken);
        }
        catch (err) {
            utils.log.warn("FirebaseAuth: verifyIdToken failed - " + messageOf(err));
            throw new VexResErr(401, null, "Invalid or expired Firebase ID token");
        }
    }

    /** The identity this sign-in writes; throws without an upstream provider, or without its subject. */
    public resolveIdentity(decoded: DecodedIdToken): resolvedIdentity {
        const signInProvider = decoded.firebase.sign_in_provider;
        const provider = providerMap[signInProvider];

        if (!provider) {
            throw new VexResErr(400, null, "This sign-in method has no upstream identity provider");
        }

        const providerUserId = readUpstreamSubject(decoded, signInProvider);
        if (!providerUserId) {
            utils.log.error("FirebaseAuth: no upstream subject for sign_in_provider " + signInProvider);
            throw new VexResErr(400, null, "Invalid Firebase ID token: the upstream identity is missing");
        }

        return { provider, providerUserId };
    }

    /** Key match first; the email fallback only when the provider verified the address. */
    private async findExisting(
        identity: resolvedIdentity,
        email: string | undefined,
        emailVerified: boolean,
    ): Promise<UserWithRelations | null> {
        const matched = await this.uapRepo.findOneWhere({
            provider: identity.provider,
            providerUserId: identity.providerUserId,
        });
        if (matched?.userId) return this.userRepo.findOne({ _id: matched.userId });

        if (email && emailVerified) {
            return this.userRepo.findOneWhere({ email });
        }

        return null;
    }

    /** Add this provider to an existing account, or refresh the stored username. */
    private async attachProfile(
        user: UserWithRelations,
        identity: resolvedIdentity,
        username: string,
    ): Promise<void> {
        const existing = await this.uapRepo.findOneWhere({
            userId: user._id,
            provider: identity.provider,
            providerUserId: identity.providerUserId,
        });

        if (!existing) {
            await this.uapRepo.create({
                userId: user._id,
                provider: identity.provider,
                providerUserId: identity.providerUserId,
                username,
            } as Partial<UserAuthProfiles>);
            return;
        }

        if (existing.username !== username) {
            await this.uapRepo.update(existing._id, { username } as Partial<UserAuthProfiles>);
        }
    }

    private async createUser(
        identity: resolvedIdentity,
        username: string,
        email: string | undefined,
    ): Promise<UserWithRelations> {
        if (!email) {
            throw new VexResErr(409, null, "This sign-in method does not provide an email address");
        }

        const user = {
            active: true,
            name: username,
            email,
            userAuthProfiles: [{
                provider: identity.provider,
                providerUserId: identity.providerUserId,
                username,
            }],
            profileErrors: "",
        } as unknown as UserWithRelations;

        // Required column in projects that declare a soft-delete marker; its name is runtime.
        const marker = entitySoftDeleteFields["UserEntity"];
        if (marker) (user as unknown as Record<string, unknown>)[marker] = false;

        const created = await this.userRepo.create(user).catch(() => {
            throw new VexResErr(500, null, "User creation failed.");
        });

        const authProfile = user.userAuthProfiles?.[0];
        if (!authProfile) {
            await this.userRepo.delete(created._id);
            throw new VexResErr(500, null, "User auth profile creation failed.");
        }

        await this.uapRepo.create({
            ...authProfile,
            userId: created._id,
        } as Partial<UserAuthProfiles>).catch(async () => {
            await this.userRepo.delete(created._id);
            throw new VexResErr(500, null, "User auth profile creation failed.");
        });
${assignRole}
        utils.log.info("FirebaseAuth: created user", identity.provider);
        return created;
    }
}
`;
}

/**
 * Everything the login page needs to drive Firebase, as emitted into `FirebaseAuthUI.gen.ts`.
 */
export interface firebaseAuthUI {
    label: string;
    sdkBaseUrl: string;
    providers: { id: string; label: string }[];
    defaultProviders: string[];
    providersEnvKey: string;
    envKeys: Record<string, string>;
    csp: {
        scriptSrc: string[];
        connectSrc: string[];
        frameSrc: string[];
    };
}

export const firebaseAuthUIDefaults: firebaseAuthUI = {
    label: "Sign in with {provider}",
    sdkBaseUrl: "https://www.gstatic.com/firebasejs/12.19.0/",
    providers: [
        { id: "google", label: "Google" },
        { id: "github", label: "GitHub" },
        { id: "apple", label: "Apple" },
        { id: "microsoft", label: "Microsoft" },
    ],
    defaultProviders: ["google"],
    providersEnvKey: "FIREBASE_PROVIDERS",
    envKeys: {
        apiKey: "FIREBASE_WEB_API_KEY",
        authDomain: "FIREBASE_WEB_AUTH_DOMAIN",
        projectId: "FIREBASE_WEB_PROJECT_ID",
    },
    csp: {
        scriptSrc: [
            "https://www.gstatic.com",
            // gapi: Firebase Auth loads it at sign-in time to synchronise the popup over an iframe.
            "https://apis.google.com",
            // reCAPTCHA, used by some Auth flows; also injected without a nonce.
            "https://www.google.com",
        ],
        connectSrc: [
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://www.googleapis.com",
        ],
        frameSrc: [
            "https://accounts.google.com",
            "https://apis.google.com",
        ],
    },
};

/**
 * `_routes/FirebaseAuthUI.gen.ts` — the login page's copy of the wiring above.
 *
 * Always written, because `LoginUI.gen.ts` imports it unconditionally; `undefined` when the feature is
 * off is the same no-op contract `AccountStateGuard.gen.ts` uses.
 */
export function uiModule(): string {
    return `// {{headerComment}}
// Generated from auth.firebase - do not edit.
// The app may still override any of this from its own server.ts; a value passed to new LoginUI({...})
// wins over this default.
import { FirebaseAuthUI } from "./LoginUI.gen";

export const firebaseAuthUI: FirebaseAuthUI | undefined = ${JSON.stringify(firebaseAuthUIDefaults, null, 4)};
`;
}

/** The no-op stand-in written when `auth.firebase` is off. */
export function disabledUIModule(): string {
    return `// {{headerComment}}
// Generated - do not edit.
// auth.firebase is off, so the login page renders no Firebase button.
import { FirebaseAuthUI } from "./LoginUI.gen";

export const firebaseAuthUI: FirebaseAuthUI | undefined = undefined;
`;
}
