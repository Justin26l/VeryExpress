/**
 * Source builders for the Firebase sign-in runtime.
 *
 * Three files, emitted only when `auth.firebase` is true — except the login-page wiring module, which
 * is written **always** (as `undefined`) because `LoginUI.gen.ts` imports it unconditionally. That is
 * the same no-op contract `accountStateGuard.generator.ts` keeps for `Authentication.middleware`.
 *
 *   _services/auth/FirebaseAdmin.gen.ts      the project credential, read from the environment
 *   _services/auth/FirebaseAuthService.gen.ts verify, resolve the upstream identity, provision the user
 *   _routes/FirebaseAuthUI.gen.ts            what the login page needs to drive the browser SDK
 *
 * The pair written to `UserAuthProfiles` is the **upstream** IdP's: `("google", <Google sub>)` for a
 * Google sign-in.
 */

/**
 * `_services/auth/FirebaseAdmin.gen.ts` — the service account, loaded once at module scope.
 *
 * Emitted source deliberately avoids backticks and `${`: it is itself interpolated into a TypeScript
 * template literal here, and the repo has been broken by a stray one before.
 */
export function adminModule(): string {
    return `// {{headerComment}}
import { initializeApp, cert, getApps, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import utils from "../../_utils";

/**
 * The Firebase project credential.
 *
 * Firebase ID tokens are verified with the vendor's own verifier (firebase-admin), which needs a
 * service account. That is the one secret this feature adds, and it is read from
 * FIREBASE_SERVICE_ACCOUNT_JSON - the JSON itself, kept as a secret.
 *
 * An absent or unusable credential is not a crash: the app starts and POST /api/auth/firebase answers
 * 503 with the reason. A missing secret must not take the whole API down.
 */

/**
 * One of the three fields cert() reads, in either spelling.
 *
 * Google's downloaded key file spells them snake_case (project_id, private_key, client_email) while
 * firebase-admin's ServiceAccount type spells them camelCase — and the SDK accepts both
 * (copyAttr(this, json, "projectId", "project_id") in credential-internal.js). Reading only the
 * camelCase spelling rejects every genuine key file, which surfaces as a 503 on the endpoint and
 * nothing else.
 */
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
 * The write path mirrors `OAuthStrategyService` deliberately: the same `(provider, providerUserId)`
 * lookup, the same composite unique index, the same soft-delete marker seed. That is what makes a
 * Google sign-in through Firebase and a Google sign-in through passport resolve to one row.
 *
 * The one deliberate difference from the passport path: a new user is also given the configured RBAC
 * default role, the same as `POST /api/auth/register` does. The passport path does not, which leaves
 * its users role-less; this one matches the registration flow and the hand-written controller this
 * replaces.
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

/** A stored identity: the pair UserAuthProfiles keys on. */
export interface resolvedIdentity {
    provider: string;
    providerUserId: string;
}

/** What one sign-in resolved to. */
export interface firebaseLoginResult {
    user: UserWithRelations;
    identity: resolvedIdentity;
    isNewUser: boolean;
}

/**
 * Firebase's sign_in_provider -> the vex provider label stored in UserAuthProfiles.provider.
 *
 * These labels are not invented here: they are the same strings the passport strategies write, which is
 * the whole point. "facebook.com" and friends are absent because vex has no passport door for them, and
 * a label nothing else writes would recreate exactly the split this feature exists to close.
 */
const providerMap: Record<string, string> = {
    "google.com": "google",
    "github.com": "github",
    "apple.com": "apple",
    "microsoft.com": "microsoft",
};

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * The upstream subject for a sign-in provider, read without letting firebase-admin's typing leak.
 *
 * firebase-admin declares identities as an index signature of any. Assigning it to unknown erases that
 * before anything reads it, and Reflect.get avoids an index-access assertion - neither any nor as
 * appears below.
 */
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

    /**
     * Verify the ID token and resolve the caller to a vex user.
     *
     * Every failure is a VexResErr with a status the controller can pass through. The messages never
     * echo a claim, so a caller cannot use them to probe which part of a token was accepted.
     */
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

    /**
     * Signature, issuer, audience and expiry, checked by firebase-admin against the project named by
     * the service account - no issuer is taken from the token itself.
     */
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

    /**
     * The single identity this sign-in writes: the upstream IdP's pair, never the broker's.
     *
     * Two refusals, both deliberate:
     *
     * - no upstream provider at all (password, phone, anonymous, custom) - there is no namespace to
     *   file the login under that anything else could reach;
     * - a known provider whose subject is missing - that is a broken token, and falling back to the
     *   broker here would store a wrong-but-plausible key that nothing ever flags.
     */
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

    /**
     * Exact key match first; the email fallback only when the token says the address is verified.
     *
     * Without that gate any provider that does not verify addresses becomes an account-takeover path:
     * claim someone else's email and inherit their account.
     */
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

        // The soft-delete marker is a required column in projects that declare one, so a brand-new row
        // must seed it. Its name is only known at runtime.
        const marker = entitySoftDeleteFields["UserEntity"];
        if (marker) (user as unknown as Record<string, unknown>)[marker] = false;

        const created = await this.userRepo.create(user).catch(() => {
            throw new VexResErr(500, null, "User creation failed.");
        });

        // Narrowed rather than dereferenced: the relation is optional on the generated type, so
        // userAuthProfiles[0] is a compile error under strict.
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
 *
 * Static on purpose: the only thing a project configures is `auth.firebase`, so everything else is
 * either a vendor fact (the SDK base URL, the CSP hosts) or a deployment concern read from the
 * environment at render time (`envKeys`, and the provider list in `providersEnvKey`).
 *
 * The SDK is the **modular** build, loaded as ES modules from gstatic at `sdkBaseUrl` — the same
 * delivery the surrounding app uses for its own Firebase web sign-in. It cannot be served from
 * `node_modules` instead: `firebase-auth.js` there imports `firebase-app.js` from a hardcoded gstatic
 * URL, so a same-origin copy of the two would be two distinct module instances and `getAuth()` would
 * not see the app this page initialized.
 */
export interface firebaseAuthUI {
    /** Button text; `{provider}` is replaced by the provider's label. */
    label: string;
    /** gstatic ESM directory for the pinned SDK version, trailing slash included. */
    sdkBaseUrl: string;
    /** Every provider the page can start, and the label to render. */
    providers: { id: string; label: string }[];
    /** Rendered when `providersEnvKey` is unset. */
    defaultProviders: string[];
    /** env var holding the comma-separated list of providers to render buttons for. */
    providersEnvKey: string;
    /** Public config key -> env var name, resolved at render time. */
    envKeys: Record<string, string>;
    /**
     * Hosts the sign-in needs, per directive.
     *
     * `scriptSrc` carries gstatic (the ES modules) and `apis.google.com` (the loader Auth injects for
     * the popup, which carries no nonce). `connectSrc` carries the token endpoints the SDK calls
     * directly. `frameSrc` gains the project's auth domain at render time.
     */
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
