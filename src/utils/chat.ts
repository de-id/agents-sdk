import { ChatMode } from '$/types';

export const isTextualChat = (chatMode: ChatMode) =>
    [ChatMode.TextOnly, ChatMode.Playground, ChatMode.Maintenance].includes(chatMode);

export const isChatModeWithoutChat = (chatMode: ChatMode | undefined) =>
    chatMode && [ChatMode.DirectPlayback, ChatMode.OuterControl].includes(chatMode);
