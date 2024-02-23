export interface BearerToken {
    type: 'bearer';
    token: string;
}

export interface BasicAuth {
    type: 'basic';
    username: string;
    password: string;
}
export interface ClientKeyAuth {
    type: 'key';
    clientKey: string;
    externalId: string;
}

export type Auth = BearerToken | BasicAuth | ClientKeyAuth;

export interface GetAuthParams {
    token?: string | null;
    username?: string | null;
    password?: string | null;
    clientKey?: string | null;
    externalId?: string | null;
}
