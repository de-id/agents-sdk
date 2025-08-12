import { Agent, AgentManagerOptions, ChatProgress, StreamEvents } from '$/types';
import { getStreamAnalyticsProps } from '$/utils/analytics';
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

function processChatEvent(
    event: ChatProgress,
    data: any,
    chatEventQueue: ChatEventQueue,
    items: AgentManagerItems,
    onNewMessage: AgentManagerOptions['callbacks']['onNewMessage']
) {
    const lastMessage = items.messages[items.messages.length - 1];

    if (!(event === ChatProgress.Partial || event === ChatProgress.Answer) || lastMessage?.role !== 'assistant') {
        return;
    }

    const { content, sequence } = data;

    if (event === ChatProgress.Partial) {
        chatEventQueue[sequence] = content;
    } else {
        chatEventQueue['answer'] = content;
    }

    const messageContent = getMessageContent(chatEventQueue);

    if (lastMessage.content !== messageContent || event === ChatProgress.Answer) {
        lastMessage.content = messageContent;

        onNewMessage?.([...items.messages], event);
    }
}

export function createMessageEventQueue(
    analytics: Analytics,
    items: AgentManagerItems,
    options: AgentManagerOptions,
    getAgent: () => Agent | null,
    onStreamDone: () => void
) {
    let chatEventQueue: ChatEventQueue = {};

    return {
        clearQueue: () => (chatEventQueue = {}),
        onMessage: (event: ChatProgress | StreamEvents, data: any) => {
            if ('content' in data) {
                processChatEvent(event as ChatProgress, data, chatEventQueue, items, options.callbacks.onNewMessage);

                if (event === ChatProgress.Answer) {
                    analytics.track('agent-message-received', {
                        messages: items.messages.length,
                        mode: items.chatMode,
                    });
                }
            } else {
                const SEvent = StreamEvents;
                const completedEvents = [SEvent.StreamVideoDone, SEvent.StreamVideoError, SEvent.StreamVideoRejected];
                const failedEvents = [SEvent.StreamFailed, SEvent.StreamVideoError, SEvent.StreamVideoRejected];
                const props = getStreamAnalyticsProps(data, getAgent, { mode: items.chatMode });

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
