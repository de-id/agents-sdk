import { Agent, AgentManagerOptions, ChatProgress, StreamEvents } from '@sdk/types';
import { Message } from '@sdk/types/entities/agents/chat';
import { getStreamAnalyticsProps } from '@sdk/utils/analytics';
import { parseMessagePartsMemo } from '@sdk/utils/content-parser';
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
        parts: parseMessagePartsMemo(data.content),
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
    onNewMessage: AgentManagerOptions['callbacks']['onNewMessage'],
    clearQueue: () => void,
    lastAssistantMessageType: 'partial' | 'answer' | null
) {
    if (event === ChatProgress.Transcribe && data.content) {
        handleAudioTranscribedMessage(data, items, onNewMessage);
        return;
    }

    if (!(event === ChatProgress.Partial || event === ChatProgress.Answer)) {
        return;
    }

    const lastMessage = items.messages[items.messages.length - 1];

    // `chat/answer` closes a logical assistant message: the next chat event (Partial or Answer)
    // starts a new one. This covers post-tool replies that follow a pre-tool ack within the same
    // turn, and consecutive answers in clips/talks flows. The orchestrator does not send a
    // message id, so the previous id-mismatch heuristic does not apply.
    const isNewAssistantMessage = lastAssistantMessageType === 'answer';

    let currentMessage: Message;
    if (lastMessage?.role === 'assistant' && !isNewAssistantMessage) {
        currentMessage = lastMessage;
    } else if (!lastMessage || (lastMessage.transcribed && lastMessage.role === 'user') || isNewAssistantMessage) {
        if (isNewAssistantMessage) {
            // Reset the streaming buffer so the next message does not inherit the previous one's content.
            clearQueue();
        }
        currentMessage = {
            id: data.id || `assistant-${Date.now()}`,
            role: data.role || 'assistant',
            content: data.content || '',
            parts: [],
            created_at: data.created_at || new Date().toISOString(),
        };
        items.messages.push(currentMessage);
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
        currentMessage.parts = parseMessagePartsMemo(messageContent);

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
    const chatEventQueue: ChatEventQueue = {};
    const clearQueue = () => {
        // Mutate the queue object so closures that captured it (e.g. the parameter inside
        // `processChatEvent`) observe the reset — reassigning the outer-scope variable would
        // leave those captured references pointing at the old, populated object.
        for (const key of Object.keys(chatEventQueue)) {
            delete chatEventQueue[key as keyof ChatEventQueue];
        }
    };
    // Tracks the last assistant chat event in the current turn. `null` means "no assistant stream
    // is in progress" (initial state, or after a non-assistant event). The flag stays `null` for
    // the first backend partial of the greeting so it adopts the locally-pushed `agent.speak()`
    // entry instead of opening a new message.
    let lastAssistantMessageType: 'partial' | 'answer' | null = null;
    const onNewMessage: AgentManagerOptions['callbacks']['onNewMessage'] = (messages, event) => {
        if (event === 'user') {
            clearQueue();
        }
        options.callbacks.onNewMessage?.(messages, event);
    };

    return {
        clearQueue,
        onMessage: (event: ChatProgress | StreamEvents, data: any) => {
            if ('content' in data) {
                const chatEvent =
                    event === StreamEvents.ChatAnswer
                        ? ChatProgress.Answer
                        : event === StreamEvents.ChatAudioTranscribed
                          ? ChatProgress.Transcribe
                          : (event as ChatProgress);
                processChatEvent(
                    chatEvent,
                    data,
                    chatEventQueue,
                    items,
                    onNewMessage,
                    clearQueue,
                    lastAssistantMessageType
                );

                // Track the chat-event boundary directly here — relying on `onNewMessage` would
                // miss empty-content partials and the next partial would still see
                // `lastAssistantMessageType === 'answer'` and open yet another message.
                if (chatEvent === ChatProgress.Partial) {
                    lastAssistantMessageType = 'partial';
                } else if (chatEvent === ChatProgress.Answer) {
                    lastAssistantMessageType = 'answer';
                    // Clear the streaming buffer so the next turn's content does not inherit
                    // leftover partial slots from this one.
                    clearQueue();
                } else {
                    lastAssistantMessageType = null;
                }

                if (chatEvent === ChatProgress.Answer) {
                    analytics.track('agent-message-received', {
                        content: data.content,
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

                    // Attach sentiment to the last assistant message if present
                    if (data.sentiment) {
                        const lastMessage = items.messages[items.messages.length - 1];
                        if (lastMessage?.role === 'assistant') {
                            const updatedMessage = { ...lastMessage, sentiment: data.sentiment };
                            items.messages[items.messages.length - 1] = updatedMessage;
                            onNewMessage?.([...items.messages], lastAssistantMessageType ?? 'answer');
                        }
                    }
                }

                if (completedEvents.includes(event)) {
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
