import { Agent, AvatarType } from '@sdk/types';

type AgentType = 'clip_v2' | Agent['avatar']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2' | 'image';

interface AvatarTraits {
    /** Streams over the real-time (LiveKit) session rather than WebRTC. */
    streamsV2: boolean;
    presenterType: PresenterType;
}

// A `Record`, so a new `AvatarType` member does not compile until it is placed here. An image agent
// rides the same real-time session as an Expressive one; only its renderer differs, and that is the
// server's concern.
const AVATAR_TRAITS: Record<AvatarType, AvatarTraits> = {
    [AvatarType.Talk]: { streamsV2: false, presenterType: 'v2' },
    [AvatarType.Clip]: { streamsV2: false, presenterType: 'v3-pro' },
    [AvatarType.Expressive]: { streamsV2: true, presenterType: 'v4' },
    [AvatarType.Image]: { streamsV2: true, presenterType: 'image' },
};

// A hand-built `Agent` can carry a value outside the enum at runtime; answer with the least
// capable tier.
const getAvatarTraits = (type: AgentType): AvatarTraits =>
    Object.prototype.hasOwnProperty.call(AVATAR_TRAITS, type)
        ? AVATAR_TRAITS[type as AvatarType]
        : AVATAR_TRAITS[AvatarType.Talk];

export const getAgentType = (presenter: Agent['avatar']): AgentType => presenter.type;

export const getPresenterType = (presenter: Agent['avatar']): PresenterType =>
    getAvatarTraits(presenter.type).presenterType;

export const isStreamsV2Agent = (type: AgentType): boolean => getAvatarTraits(type).streamsV2;
