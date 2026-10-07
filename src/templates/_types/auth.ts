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