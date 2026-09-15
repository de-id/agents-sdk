/**
 * A bearer token for the D-ID API.
 *
 * Account-wide, so it is meant for a trusted environment — a server, a build step, an internal
 * tool. Anyone who reads the token can spend the account's credits, so do not ship one in a page
 * you serve to users; use {@link ClientKeyAuth} there. The SDK sends it as
 * `Authorization: Bearer <token>~<connectionId>`, appending a per-connection id the D-ID
 * authorizer strips before it validates the token.
 *
 * @category Agent Manager
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
 * HTTP basic credentials for the D-ID API, given either pre-encoded or as a username and password.
 *
 * Like {@link BearerToken} these are account-wide and belong in a trusted environment, never in a
 * client bundle. The SDK sends them as `Authorization: Basic <credentials>~<connectionId>`, where
 * the `token` form is used as the credentials as-is and the `username`/`password` form is
 * base64-encoded as `username:password` first; the trailing per-connection id is stripped by the
 * D-ID authorizer before the credentials are validated.
 *
 * @category Agent Manager
 */
export type BasicAuth =
    | {
          /**
           * Discriminator selecting this variant of {@link Auth}.
           */
          type: 'basic';
          /**
           * Credentials that are already base64-encoded, as `username:password`. Used as they
           * are, so they are not encoded a second time.
           */
          token: string;
      }
    | {
          /**
           * Discriminator selecting this variant of {@link Auth}.
           */
          type: 'basic';
          /**
           * The account's user name; base64-encoded with the password before it is sent.
           */
          username: string;
          /**
           * The account's password; base64-encoded with the user name before it is sent.
           */
          password: string;
      };

/**
 * A client key for the D-ID API — the credential to use in a browser.
 *
 * This is the one shape that is safe to ship in a page: a client key is scoped to a single agent
 * and only works from the domains allowed for it in D-ID Studio, so it cannot be reused elsewhere.
 * Copy it from the agent's Embed snippet, where it appears as `data-client-key`. The SDK sends it
 * as `Authorization: Client-Key <clientKey>.<externalId>_<connectionId>`, where the external id is
 * either {@link AgentManagerOptions.externalId | externalId} or a per-browser id the SDK keeps in
 * `localStorage`.
 *
 * @category Agent Manager
 */
export interface ClientKeyAuth {
    /**
     * Discriminator selecting this variant of {@link Auth}.
     */
    type: 'key';
    /**
     * The client key, the `data-client-key` value from the agent's Embed snippet in D-ID Studio.
     */
    clientKey: string;
}

/**
 * The credentials {@link createAgentManager} accepts, as
 * {@link AgentManagerOptions.auth | options.auth}.
 *
 * Pick {@link ClientKeyAuth} (`{ type: 'key', clientKey }`) for anything that runs in a browser: it
 * is the only variant scoped to one agent and to the domains you allowed. {@link BearerToken} and
 * {@link BasicAuth} carry account-wide credentials and belong in a trusted environment. Whichever
 * you pass is used for every request the SDK makes — the REST calls, the video stream and the
 * notifications web socket.
 *
 * @category Agent Manager
 */
export type Auth = BearerToken | BasicAuth | ClientKeyAuth;

/**
 * The same credentials as {@link Auth}, flattened into optional fields.
 *
 * Exported for applications that hold credentials as loose, possibly empty values — a form, a query
 * string, a configuration object — and build an {@link Auth} from whichever of them is set. D-ID's
 * own agents-ui does this; the SDK itself does not read this type, and
 * {@link createAgentManager} still expects a proper {@link Auth}.
 *
 * @category Agent Manager
 */
/**
 * A bearer token, or pre-encoded basic credentials — the `token` of {@link BearerToken} or of
 * {@link BasicAuth}.
 */
/**
 * The user name of {@link BasicAuth}, to be paired with
 * {@link GetAuthParams.password | password}.
 */
/**
 * The password of {@link BasicAuth}, to be paired with
 * {@link GetAuthParams.username | username}.
 */
/**
 * The `clientKey` of {@link ClientKeyAuth}.
 */
