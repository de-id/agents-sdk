/**
 * The kind of avatar an agent is built on, which is what decides how its video is produced.
 *
 * It is the `type` of the agent's avatar ({@link Agent.avatar}) and so determines which SDK
 * features a session has: {@link VideoType.Talk | talk} is Talks (V2),
 * {@link VideoType.Clip | clip} is Clips (V3), and {@link VideoType.Expressive | expressive} is
 * Expressive (V4).
 *
 * @category Agent Manager
 */
export enum AvatarType {
    /** A Clips (V3) agent: a pre-recorded presenter, driven by the D-ID Clips pipeline. */
    Clip = 'clip',
    /** A Talks (V2) agent: a still photo animated to speak. */
    Talk = 'talk',
    /**
     * An Expressive (V4) avatar: a real-time avatar that also supports microphone and camera
     * publishing, client tools and interruption.
     */
    Expressive = 'expressive',
}
