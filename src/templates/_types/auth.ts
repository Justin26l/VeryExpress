export interface tokenResponse {
    accessToken: string;
    accessTokenIndex: string;
    refreshToken: string;
    refreshTokenIndex: string
}

export interface refreshTokenResponse {
    accessToken: string;
    accessTokenIndex: string;
}

export interface registerResponse {
    message: string
}

export interface localLoginResponse {
    url: string;
}

/**
 * `POST /auth/firebase` — the answer to a Firebase sign-in.
 * `isNewUser` is true only when this call created the `User` row; a user linked by a verified email address is false.
 */
export interface firebaseLoginResponse {
    accessToken: string;
    accessTokenIndex: string;
    refreshToken: string;
    refreshTokenIndex: string;
    isNewUser: boolean;
}

/** Row counts removed alongside the tombstone, so the caller can log and retry. */
export interface deleteAccountCounts {
    authProfiles: number;
    userRoles: number;
    sessions: number;
    /** Tenant mappings removed (tenant isolation only). */
    userTenants?: number;
}

/** Result of a self-service account deletion. */
export interface deleteAccountResponse {
    userId: string;
    /** When the tombstone was written (the row's updatedAt). Empty on a repeat call or a tenant leave. */
    tombstonedAt: string;
    deleted: deleteAccountCounts;
    /** Set when the account left one tenant instead of being tombstoned. */
    tenantId?: string;
    /** Rows removed from `auth.deleteAccount.deleteTables`, keyed by document name. */
    related?: Record<string, number>;
}