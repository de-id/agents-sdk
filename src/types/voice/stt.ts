/**
 * A short-lived credential for the D-ID speech-to-text service.
 *
 * What {@link AgentManager.getSTTToken | getSTTToken()} resolves with, fetched fresh from the
 * Agents API each time. It lets an application drive its own speech recognition against the
 * service the agent uses without putting D-ID credentials in the browser. The token expires, so
 * request one per recognition session rather than holding on to it.
 *
 * @category Agent Manager
 */
export interface STTTokenResponse {
    /** The authorization token to present to the speech service. */
    token: string;
    /** The speech service region the token is valid in. */
    region: string;
}
