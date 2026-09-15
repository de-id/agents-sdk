/**
 * Rendering tier of an agent's avatar, as reported by `Agent.avatar.type`.
 *
 * Talks (V2) and Clips (V3) agents stream over WebRTC; Expressive (V4) agents stream over
 * LiveKit and are the only tier on which the microphone, camera and data-channel methods work.
 *
 * @category Agent Manager
 */
export enum VideoType {
    /** A Clips (V3) agent, built on a Pro avatar. */
    Clip = 'clip',
    /** A Talks (V2) agent. */
    Talk = 'talk',
    /** An Expressive (V4) agent. */
    Expressive = 'expressive',
}
