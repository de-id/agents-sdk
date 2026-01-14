import { Agent, AgentManagerOptions, ChatProgress, StreamEvents } from '@sdk/types';
import { Message } from '@sdk/types/entities/agents/chat';
import { getStreamAnalyticsProps } from '@sdk/utils/analytics';
import { AgentManagerItems } from '../agent-manager';
import { Analytics } from '../analytics/mixpanel';

export interface ChatEventQueue {
    [sequence: number]: string;
    answer?: string;
}

function getMessageContent(chatEventQueue: ChatEventQueue) {
    if (chatEventQueue['answer'] !== undefined) {
        return chatEventQueue['answer'];
    }

    let currentSequence = 0;
    let content = '';

    while (currentSequence in chatEventQueue) {
        content += chatEventQueue[currentSequence++];
    }

    return content;
}

function handleAudioTranscribedMessage(
    data: any,
    items: AgentManagerItems,
    onNewMessage: AgentManagerOptions['callbacks']['onNewMessage']
) {
    if (!data.content) {
        return;
    }

    // Mark the last assistant message as interrupted when new user input arrives via server-side STT
    const lastMessage = items.messages[items.messages.length - 1];
    if (lastMessage?.role === 'assistant' && !lastMessage.interrupted) {
        lastMessage.interrupted = true;
    }

    const userMessage: Message = {
        id: data.id || `user-${Date.now()}`,
        role: data.role,
        content: data.content,
        created_at: data.created_at || new Date().toISOString(),
        transcribed: true,
    };
    items.messages.push(userMessage);
    onNewMessage?.([...items.messages], 'user');
}

function processChatEvent(
    event: ChatProgress,
    data: any,
    chatEventQueue: ChatEventQueue,
    items: AgentManagerItems,
    onNewMessage: AgentManagerOptions['callbacks']['onNewMessage']
) {
    if (event === ChatProgress.Transcribe && data.content) {
        handleAudioTranscribedMessage(data, items, onNewMessage);
        return;
    }

    if (!(event === ChatProgress.Partial || event === ChatProgress.Answer)) {
        return;
    }

    const lastMessage = items.messages[items.messages.length - 1];

    let currentMessage: Message;
    if (lastMessage?.transcribed && lastMessage.role === 'user') {
        const initialContent = event === ChatProgress.Answer ? data.content || '' : '';
        currentMessage = {
            id: data.id || `assistant-${Date.now()}`,
            role: data.role || 'assistant',
            content: data.content || '',
            created_at: data.created_at || new Date().toISOString(),
        };
        items.messages.push(currentMessage);
    } else if (lastMessage?.role === 'assistant') {
        currentMessage = lastMessage;
    } else {
        return;
    }

    const { content, sequence } = data;

    if (event === ChatProgress.Partial) {
        chatEventQueue[sequence] = content;
    } else {
        chatEventQueue['answer'] = content;
    }

    const messageContent = getMessageContent(chatEventQueue);

    if (currentMessage.content !== messageContent || event === ChatProgress.Answer) {
        currentMessage.content = messageContent;

        onNewMessage?.([...items.messages], event);
    }
}

export function createMessageEventQueue(
    analytics: Analytics,
    items: AgentManagerItems,
    options: AgentManagerOptions,
    agentEntity: Agent,
    onStreamDone: () => void
) {
    let chatEventQueue: ChatEventQueue = {};

    return {
        clearQueue: () => (chatEventQueue = {}),
        onMessage: (event: ChatProgress | StreamEvents, data: any) => {
            if ('content' in data) {
                const chatEvent =
                    event === StreamEvents.ChatAnswer
                        ? ChatProgress.Answer
                        : event === StreamEvents.ChatAudioTranscribed
                          ? ChatProgress.Transcribe
                          : (event as ChatProgress);
                processChatEvent(chatEvent, data, chatEventQueue, items, options.callbacks.onNewMessage);

                if (chatEvent === ChatProgress.Answer) {
                    analytics.track('agent-message-received', {
                        messages: items.messages.length,
                        mode: items.chatMode,
                    });
                }
            } else {
                const SEvent = StreamEvents;
                const completedEvents = [SEvent.StreamVideoDone, SEvent.StreamVideoError, SEvent.StreamVideoRejected];
                const failedEvents = [SEvent.StreamFailed, SEvent.StreamVideoError, SEvent.StreamVideoRejected];
                const props = getStreamAnalyticsProps(data, agentEntity, { mode: items.chatMode });

                event = event as StreamEvents;

                if (event === SEvent.StreamVideoCreated) {
                    analytics.linkTrack('agent-video', props, SEvent.StreamVideoCreated, ['start']);
                } else if (completedEvents.includes(event)) {
                    // Stream video event
                    const streamEvent = event.split('/')[1];

                    if (failedEvents.includes(event)) {
                        // Dont depend on video state change if stream failed
                        analytics.track('agent-video', { ...props, event: streamEvent });
                    } else {
                        analytics.linkTrack('agent-video', { ...props, event: streamEvent }, event, ['done']);
                    }
                }

                if (failedEvents.includes(event)) {
                    options.callbacks.onError?.(new Error(`Stream failed with event ${event}`), { data });
                }

                if (data.event === SEvent.StreamDone) {
                    onStreamDone();
                }
            }
        },
    };
}
