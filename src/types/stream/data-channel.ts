/**
 * Data-channel topics messages can be sent on.
 * V2 (LiveKit) routes by topic; V1 (WebRTC) has no topic concept and ignores it.
 *
 * Internal on purpose: this module is deliberately left out of the `stream`
 * barrel so the topics driven by dedicated methods (`chat`, `speak`,
 * `interrupt`, `setSttLanguage`) never reach the package's public API.
 * Customers get `PublicDataChannelTopic` instead.
 */
export enum DataChannelTopic {
    Chat = 'lk.chat',
    Speak = 'did.speak',
    Interrupt = 'did.interrupt',
    SttLanguage = 'did.stt-language',
    Presentation = 'did.presentation',
}
