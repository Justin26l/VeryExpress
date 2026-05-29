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