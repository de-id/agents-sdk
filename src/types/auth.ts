/**
 * A D-ID user access token: the short-lived token a signed-in D-ID user holds.
 *
 * It is what D-ID's own applications use. An integration authenticates with an API key
 * ({@link BasicAuth}) on a server, or with a client key ({@link ClientKeyAuth}) in a browser. The
 * SDK sends it as `Authorization: Bearer <token>~<connectionId>`; the D-ID authorizer strips the
 * per-connection id before it validates the token.
 *
 * @category Authentication
 */
export interface BearerToken {
    /**
     * Discriminator selecting this variant of {@link Auth}.
     */
    type: 'bearer';
    /**
     * The bearer token itself, sent in the `Authorization` header.
     */
    token: string;
}

/**
 * A D-ID API key, sent with HTTP basic authentication.
 *
 * An API key from D-ID Studio has the form `API_USERNAME:API_PASSWORD`. Pass it whole as `token`,
 * or split at the colon into `username` and `password`. It gives access to the whole account, so
 * keep it on a server and never ship it in a page; use {@link ClientKeyAuth} in a browser. The SDK
 * sends it as `Authorization: Basic <credentials>~<connectionId>`; the D-ID authorizer strips the
 * per-connection id before it validates the key.
 *
 * @see [Basic authentication](https://docs.d-id.com/reference/basic-authentication)
 *
 * @category Authentication
 */
export type BasicAuth =
    | {
          /**
           * Discriminator selecting this variant of {@link Auth}.
           */
          type: 'basic';
          /**
           * The API key as D-ID Studio shows it (`API_USERNAME:API_PASSWORD`), or that string
           * base64-encoded. Sent as given.
           */
          token: string;
      }
    | {
          /**
           * Discriminator selecting this variant of {@link Auth}.
           */
          type: 'basic';
          /**
           * The part of the API key before the colon (`API_USERNAME`). It is not the account's
           * email address.
           */
          username: string;
          /**
           * The part of the API key after the colon (`API_PASSWORD`).
           */
          password: string;
      };

/**
 * A client key for the Agents API — the credential to use in a browser.
 *
 * This is the one credential that is safe to ship in a page: a client key works for one agent,
 * and only from the domains allowed for it. Copy it from the agent's Embed snippet, where it
 * appears as `data-client-key`, or create one with the Agents API (see the link below). The SDK
 * sends it as `Authorization: Client-Key <clientKey>.<externalId>_<connectionId>`, where the external id is
 * either {@link AgentManagerOptions.externalId | externalId} or a per-browser id the SDK keeps in
 * `localStorage`.
 *
 * @see [Create an agent client key](https://docs.d-id.com/reference/createresourceclientkey)
 * @category Authentication
 */
export interface ClientKeyAuth {
    /**
     * Discriminator selecting this variant of {@link Auth}.
     */
    type: 'key';
    /**
     * The client key: the `data-client-key` value from the agent's Embed snippet, or a key created with
     * the Agents API.
     */
    clientKey: string;
}

/**
 * The credentials {@link createAgentManager} accepts, as
 * {@link AgentManagerOptions.auth | options.auth}.
 *
 * Pick {@link ClientKeyAuth} (`{ type: 'key', clientKey }`) for anything that runs in a browser: it
 * is the only variant limited to one agent and to the domains you allowed. {@link BasicAuth} is an
 * API key with access to the whole account, for a server. {@link BearerToken} is a D-ID user access
 * token. Whichever you pass is used for every request the SDK makes: the REST calls, the video
 * stream and the notifications web socket.
 *
 * @category Authentication
 */
export type Auth = BearerToken | BasicAuth | ClientKeyAuth;
