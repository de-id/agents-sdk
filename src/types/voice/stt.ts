/**
 * A short-lived Azure Speech authorization token, issued by the Agents API.
 *
 * What {@link AgentManager.getSttToken | getSttToken()} resolves with. It lets an application run
 * Azure speech recognition in the browser without holding a speech subscription key. Azure tokens
 * expire after about ten minutes, so request one per recognition session.
 *
 * @category Agent Manager
 */
export interface SttTokenResponse {
    /** The authorization token to present to Azure Speech. */
    token: string;
    /** The Azure region the token is valid in. */
    region: string;
}
