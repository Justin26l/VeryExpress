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

/**
 * A redirect back to the client carrying a single-use `sessionCode`, which the client exchanges at
 * `POST /auth/token` for the token pair.
 *
 * Neutral name on purpose: `/auth/local` and `/auth/external` both answer with this shape, and the two
 * are independently enabled (`localAuth` vs `auth.externalIdentity`), so the type cannot live behind
 * either flag.
 */
export interface loginRedirectResponse {
    url: string;
}

/** Row counts removed alongside the tombstone, so the caller can log and retry. */
export interface deleteAccountCounts {
    authProfiles: number;
    userRoles: number;
    sessions: number;
}

/** Result of a self-service account deletion. */
export interface deleteAccountResponse {
    userId: string;
    /** When the tombstone was written (the row's updatedAt). Empty on a repeat call. */
    tombstonedAt: string;
    deleted: deleteAccountCounts;
}