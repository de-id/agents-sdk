import { Factory } from 'rosie';

import { ChatMode } from '../../types';

export const ChatFactory = new Factory().attrs({
    id: 'chat-123',
    chat_mode: ChatMode.Functional,
});
