import { ChatMode } from '$/types';

export const isTextualChat = (chatMode: ChatMode) =>
    [ChatMode.TextOnly, ChatMode.Playground, ChatMode.Maintenance].includes(chatMode);
