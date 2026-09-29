import { resolvedExternalIdentity } from "~/utils/identityPresets";

/**
 * Source builders for the external-identity runtime.
 *
 * Everything here is emitted only when the feature is enabled — except the login-page wiring module,
 * which is always written (as `undefined`) because `LoginUI.gen.ts` imports it unconditionally. That is
 * the same no-op trick `accountStateGuard.generator.ts` uses for `Authentication.middleware`.
 */

const settingsInterface = `
export interface ExternalIdentitySettings {
    providerLabel: string;
    issuer: string;
    jwksUrl: string | null;
    discovery: boolean;
    audience: string | null;
    audienceClaim: string;
    algorithms: string[];
    identityLayer: "auto" | "broker" | "upstream";
    upstreamProvider: { claim: string; map: Record<string, string> } | null;
    upstreamSub: { from: string; keyedByProvider: boolean } | null;
    claims: { id: string; email: string; emailVerified: string; username: string[] };
    onMissingEmail: "reject" | "synthesize";
}
`;

/** `_services/auth/ExternalIdentityConfig.gen.ts` — every resolved setting, as a frozen literal. */
export function configModule(settings: resolvedExternalIdentity): string {
    const value = {
        providerLabel: settings.providerLabel,
        issuer: settings.issuer,
        jwksUrl: settings.jwksUrl,
        discovery: settings.discovery,
        audience: settings.audience,
        audienceClaim: settings.audienceClaim,
        algorithms: settings.algorithms,
        identityLayer: settings.identityLayer,
        upstreamProvider: settings.upstreamProvider,
        upstreamSub: settings.upstreamSub,
        claims: settings.claims,
        onMissingEmail: settings.onMissingEmail,
    };

    return `// {{headerComment}}
// Resolved from auth.externalIdentity. Generated — do not edit.
${settingsInterface}
export const externalIdentitySettings: ExternalIdentitySettings = ${JSON.stringify(value, null, 4)};
`;
}

/**
 * `_services/auth/JwksProvider.gen.ts` — key resolution and caching.
 *
 * Deliberately made of `fetch` + `node:crypto`, both already available: no `firebase-admin`, no `jose`,
 * no new dependency in the generated app. `crypto.createPublicKey({ format: "jwk" })` imports RSA and
 * EC JWKs natively.
 */
export function jwksProvider(): string {
    return `// {{headerComment}}
import crypto from "crypto";
import { externalIdentitySettings } from "./ExternalIdentityConfig.gen";
import utils from "../../_utils";

interface JwkSet {
    keys: (JsonWebKey & { kid?: string; alg?: string })[];
}

/** How long an unknown-kid refetch is suppressed, so a stale token cannot hammer the issuer. */
const REFETCH_COOLDOWN_MS = 30_000;
const DEFAULT_CACHE_MS = 300_000;

/**
 * Resolves signing keys for the configured issuer.
 *
 * The issuer is pinned in configuration and is never taken from a token: a verifier that fetched the
 * \`jwks_uri\` named by an unvalidated \`iss\` claim would be an SSRF gadget. Discovery, when enabled, is
 * fetched from the configured issuer only.
 */
export default class JwksProvider {

    private keys: JwkSet | null = null;
    private expiresAt = 0;
    private lastRefetch = 0;
    private discoveryUrl: string | null = null;

    /**
     * Public key for \`kid\`, as PEM.
     *
     * On an unknown \`kid\` the set is refetched once (rate-limited): issuers rotate keys, and a token
     * signed with a key issued after our last fetch is legitimate.
     */
    public async getKey(kid: string): Promise<string | null> {
        const keys = await this.load(false);
        const match = keys.keys.find((key) => key.kid === kid);
        if (match) return this.toPem(match);

        if (Date.now() - this.lastRefetch < REFETCH_COOLDOWN_MS) return null;

        this.lastRefetch = Date.now();
        const refreshed = await this.load(true);
        const rotated = refreshed.keys.find((key) => key.kid === kid);
        return rotated ? this.toPem(rotated) : null;
    }

    private async load(force: boolean): Promise<JwkSet> {
        if (!force && this.keys && Date.now() < this.expiresAt) return this.keys;

        const url = externalIdentitySettings.jwksUrl ?? await this.resolveDiscoveryUrl();
        if (!url) throw new Error("external identity: no JWKS URL available");

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(\`external identity: JWKS fetch failed (\${response.status})\`);
        }

        this.keys = await response.json() as JwkSet;
        this.expiresAt = Date.now() + this.cacheMs(response.headers.get("cache-control"));
        utils.log.info("ExternalIdentity: JWKS refreshed", url);

        return this.keys;
    }

    /** \`cache-control: max-age=N\`, honouring the issuer rather than guessing. */
    private cacheMs(header: string | null): number {
        const maxAge = header ? /max-age=(\\d+)/.exec(header) : null;
        if (!maxAge) return DEFAULT_CACHE_MS;

        const seconds = Number(maxAge[1]);
        return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_CACHE_MS;
    }

    private async resolveDiscoveryUrl(): Promise<string | null> {
        if (this.discoveryUrl) return this.discoveryUrl;
        if (!externalIdentitySettings.discovery) return null;

        const url = \`\${externalIdentitySettings.issuer.replace(/\\/$/, "")}/.well-known/openid-configuration\`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(\`external identity: discovery failed (\${response.status})\`);
        }

        const document = await response.json() as { jwks_uri?: string };
        if (!document.jwks_uri) {
            throw new Error("external identity: discovery document has no jwks_uri");
        }

        this.discoveryUrl = document.jwks_uri;
        return this.discoveryUrl;
    }

    private toPem(jwk: JsonWebKey): string {
        const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
        return key.export({ type: "spki", format: "pem" }) as string;
    }
}
`;
}

/**
 * `_services/auth/ExternalIdentityService.gen.ts` — verify a broker ID token, then find or create the
 * vex identity it names.
 *
 * The write path mirrors `OAuthStrategyService` so both inbound doors produce identical rows: the same
 * `(provider, providerUserId)` key, the same composite unique index, the same soft-delete marker seed.
 */
export function externalIdentityService(): string {
    return `// {{headerComment}}
import jwt from "jsonwebtoken";
import { UserEntity, User, UserWithRelations } from "../../_models/UserModel.gen";
import { UserAuthProfilesEntity, UserAuthProfiles } from "../../_models/UserAuthProfilesModel.gen";
import { VexRepository, VexResErr } from "../../_types/vex";
import { entitySoftDeleteFields } from "../../_middlewares/VexFieldRegistry.gen";
import { externalIdentitySettings } from "./ExternalIdentityConfig.gen";
import JwksProvider from "./JwksProvider.gen";
import VexDb from "../VexDb.gen";
import utils from "../../_utils";

/** A stored identity: the pair that \`UserAuthProfiles\` keys on. */
export interface resolvedIdentity {
    provider: string;
    providerUserId: string;
}

interface decodedToken {
    [claim: string]: unknown;
}

/**
 * Read a dot-separated claim path.
 *
 * \`firebase.identities\`, \`firebase.sign_in_provider\` and Keycloak-style nested claims all need this;
 * a plain property lookup would silently miss every one of them.
 */
export function claimPath(payload: decodedToken, path: string): unknown {
    return path.split(".").reduce<unknown>((current, key) => {
        if (current === null || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[key];
    }, payload);
}

/** First non-empty string among the configured claim paths. */
function firstClaim(payload: decodedToken, paths: string[]): string | undefined {
    for (const path of paths) {
        const value = claimPath(payload, path);
        if (typeof value === "string" && value.length > 0) return value;
        if (typeof value === "number") return String(value);
    }
    return undefined;
}

export default class ExternalIdentityService {

    private jwks = new JwksProvider();

    private get userRepo(): VexRepository<UserWithRelations> {
        return VexDb.getRepository<UserWithRelations>(UserEntity);
    }

    private get uapRepo(): VexRepository<UserAuthProfiles> {
        return VexDb.getRepository<UserAuthProfiles>(UserAuthProfilesEntity);
    }

    /**
     * Verify the token and resolve the caller to a vex user.
     *
     * Every failure is a \`VexResErr\` with a status the controller can pass through, and the messages
     * never echo a claim or distinguish "unknown key" from "bad signature".
     */
    public async authenticate(idToken: string): Promise<{ user: UserWithRelations; identity: resolvedIdentity }> {
        const payload = await this.verify(idToken);
        const identity = this.resolveIdentity(payload);
        const email = firstClaim(payload, [externalIdentitySettings.claims.email]);
        const emailVerified = claimPath(payload, externalIdentitySettings.claims.emailVerified) === true;
        const username = firstClaim(payload, externalIdentitySettings.claims.username) ?? identity.providerUserId;

        const existing = await this.findExisting(identity, email, emailVerified);
        if (existing) {
            await this.attachProfile(existing, identity, username);
            return { user: existing, identity };
        }

        return { user: await this.createUser(identity, username, email), identity };
    }

    /**
     * Verify signature, issuer, expiry and audience.
     *
     * \`issuer\` comes from configuration, never from the token — a verifier that honoured an
     * unvalidated \`iss\` would fetch keys from wherever the token said.
     */
    public async verify(idToken: string): Promise<decodedToken> {
        const decoded = jwt.decode(idToken, { complete: true });
        if (!decoded || typeof decoded === "string" || !decoded.header) {
            throw new VexResErr(400, null, "Invalid identity token");
        }

        const { kid, alg } = decoded.header;
        if (!kid) throw new VexResErr(400, null, "Invalid identity token");
        if (!externalIdentitySettings.algorithms.includes(alg)) {
            // Rejecting HS* here is what makes alg-confusion impossible: a token signed with the
            // public key as an HMAC secret never reaches verification.
            throw new VexResErr(400, null, "Invalid identity token");
        }

        const key = await this.jwks.getKey(kid);
        if (!key) throw new VexResErr(400, null, "Invalid identity token");

        let payload: decodedToken;
        try {
            payload = jwt.verify(idToken, key, {
                algorithms: externalIdentitySettings.algorithms as jwt.Algorithm[],
                issuer: externalIdentitySettings.issuer,
            }) as decodedToken;
        }
        catch (err) {
            const expired = err instanceof jwt.TokenExpiredError;
            throw new VexResErr(expired ? 401 : 400, null,
                expired ? "Identity token expired" : "Invalid identity token");
        }

        if (typeof payload.sub !== "string" || payload.sub.length === 0) {
            throw new VexResErr(400, null, "Invalid identity token");
        }

        this.assertAudience(payload);
        return payload;
    }

    private assertAudience(payload: decodedToken): void {
        const expected = externalIdentitySettings.audience;
        if (!expected) return;

        const actual = claimPath(payload, externalIdentitySettings.audienceClaim);
        const match = Array.isArray(actual) ? actual.includes(expected) : actual === expected;
        if (!match) throw new VexResErr(400, null, "Invalid identity token");
    }

    /**
     * The single identity this login writes (D12).
     *
     * \`provider\` and \`providerUserId\` always come from the same layer, so the stored pair can never
     * name a namespace its id does not belong to: either the broker's own pair, or the upstream IdP's.
     * \`auto\` prefers upstream when this login carries one and falls back to the broker when it does
     * not (a Firebase password or phone sign-in has no upstream provider).
     */
    public resolveIdentity(payload: decodedToken): resolvedIdentity {
        const settings = externalIdentitySettings;
        const subject = claimPath(payload, settings.claims.id);
        if (typeof subject !== "string" || subject.length === 0) {
            throw new VexResErr(400, null, "Invalid identity token");
        }

        const broker: resolvedIdentity = { provider: settings.providerLabel, providerUserId: subject };
        if (settings.identityLayer === "broker") return this.guardProvider(broker);

        const upstream = this.resolveUpstream(payload);
        if (settings.identityLayer === "upstream" && !upstream) {
            throw new VexResErr(400, null, "Invalid identity token");
        }

        return this.guardProvider(upstream ?? broker);
    }

    /** The upstream IdP pair, or null when this login has no upstream provider (or no subject). */
    private resolveUpstream(payload: decodedToken): resolvedIdentity | null {
        const settings = externalIdentitySettings;
        if (!settings.upstreamProvider || !settings.upstreamSub) return null;

        const signInProvider = claimPath(payload, settings.upstreamProvider.claim);
        if (typeof signInProvider !== "string") return null;

        const provider = settings.upstreamProvider.map[signInProvider];
        if (!provider) return null;   // e.g. "password"/"phone": nothing upstream to name

        const identities = claimPath(payload, settings.upstreamSub.from);
        if (!identities || typeof identities !== "object") return null;

        const subjects = (identities as Record<string, unknown>)[signInProvider];
        if (!Array.isArray(subjects) || typeof subjects[0] !== "string") return null;

        return { provider, providerUserId: subjects[0] };
    }

    /** "local" belongs to vex's own password path: verifyPassword looks rows up by that provider. */
    private guardProvider(identity: resolvedIdentity): resolvedIdentity {
        if (identity.provider === "local") {
            throw new VexResErr(400, null, "Invalid identity token");
        }

        return identity;
    }

    /**
     * Exact key match first; the email fallback only when the provider says the address is verified.
     *
     * Without that gate any provider that does not verify addresses becomes an account-takeover path:
     * claim someone else's email and inherit their account.
     */
    private async findExisting(
        identity: resolvedIdentity,
        email: string | undefined,
        emailVerified: boolean,
    ): Promise<UserWithRelations | null> {
        const matched = await this.uapRepo.findOneWhere(
            { provider: identity.provider, providerUserId: identity.providerUserId },
        );
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
        if (!email && externalIdentitySettings.onMissingEmail === "reject") {
            throw new VexResErr(409, null, "This sign-in method does not provide an email address");
        }

        const user = {
            active: true,
            name: username,
            email: email ?? \`\${identity.providerUserId}@\${identity.provider}.invalid\`,
            userAuthProfiles: [{
                provider: identity.provider,
                providerUserId: identity.providerUserId,
                username,
            }],
            profileErrors: "",
        } as unknown as UserWithRelations;

        // The marker is a plain column and is required in projects that declare one, so it must be
        // seeded on a brand-new row. The field name is only known at runtime.
        const marker = entitySoftDeleteFields["UserEntity"];
        if (marker) (user as unknown as Record<string, unknown>)[marker] = false;

        const created = await this.userRepo.create(user);

        if (user.userAuthProfiles?.[0]) {
            await this.uapRepo.create({
                ...user.userAuthProfiles[0],
                userId: created._id,
            } as Partial<UserAuthProfiles>);
        }

        utils.log.info("ExternalIdentity: created user", identity.provider);
        return created;
    }
}
`;
}

/**
 * `_routes/ExternalIdentityUI.gen.ts` — what the generated login page needs to drive the broker.
 *
 * Always written, because `LoginUI.gen.ts` imports it unconditionally; \`undefined\` when the feature is
 * off is the same no-op contract `AccountStateGuard.gen.ts` uses.
 */
export function uiModule(settings: resolvedExternalIdentity | null): string {
    if (!settings) {
        return `// {{headerComment}}
// Generated — do not edit.
// No external identity is configured, so the login page renders no broker button.
import { ExternalIdentityUI } from "./LoginUI.gen";

export const externalIdentityUI: ExternalIdentityUI | undefined = undefined;
`;
    }

    return `// {{headerComment}}
// Generated from auth.externalIdentity — do not edit.
// The app may still override any of this from its own server.ts; a value passed to \`new LoginUI({...})\`
// wins over this default.
import { ExternalIdentityUI } from "./LoginUI.gen";

export const externalIdentityUI: ExternalIdentityUI | undefined = ${JSON.stringify(settings.ui, null, 4)};
`;
}
