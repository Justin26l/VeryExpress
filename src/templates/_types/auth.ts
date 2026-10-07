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
 *
 * Deliberately **not** the 302 + `sessionCode` shape the local and passport doors use: this endpoint is
 * called by clients that already speak it (an app posting a Firebase ID token expects the token pair
 * back), and that contract is frozen so those clients need no change. `isNewUser` is true only when
 * this call created the `User` row; a user linked by a verified email address is false.
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
}

/** Result of a self-service account deletion. */
export interface deleteAccountResponse {
    userId: string;
    /** When the tombstone was written (the row's updatedAt). Empty on a repeat call. */
    tombstonedAt: string;
    deleted: deleteAccountCounts;
}