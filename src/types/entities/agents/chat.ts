/**
 * A rating stored against one message of a chat, as the Agents API returns it.
 *
 * Produced by {@link AgentManager.rate | rate()} and returned again by
 * {@link AgentManager.deleteRate | deleteRate()}. Keep {@link Rating.id | id} if the user may
 * change their mind: pass it back to {@link AgentManager.rate | rate()} as `rateId` to update the
 * rating, or to {@link AgentManager.deleteRate | deleteRate()} to remove it.
 *
 * @category Chat
 */
export interface Rating {
    /**
     * Id of this rating.
     *
     * Pass it as the `rateId` argument of {@link AgentManager.rate | rate()} to update the rating,
     * or to {@link AgentManager.deleteRate | deleteRate()} to remove it.
     */
    id: string;
    /** Id of the D-ID account that owns the agent the rating was left on. Set by the Agents API. */
    owner_id: string;
    /** Id of the agent whose answer was rated. */
    agent_id: string;
    /**
     * The knowledge citations that were attached to the rated answer, as `[document_id, id]` pairs.
     *
     * The SDK builds them from the {@link Message.matches | matches} of the rated message, so a
     * negative rating can be traced back to the documents the answer was drawn from. Empty when the
     * answer cited nothing.
     */
    matches: [string, string][];
    /**
     * Id of the agent's knowledge base ({@link Agent.knowledge}) at the time of the rating.
     *
     * An empty string when the agent has no knowledge base.
     */
    knowledge_id: string;
    /**
     * The end-user identifier the Agents API recorded for the request.
     *
     * Derived from the credentials the SDK sends, which carry
     * {@link AgentManagerOptions.externalId | externalId} for `type: 'key'` authorization.
     */
    external_id: string;
    /** Identity the Agents API attributed the rating to. Set by the Agents API. */
    created_by: string;
    /** Id of the chat the rated message belongs to — the value
     * {@link AgentManagerCallbacks.onNewChat | onNewChat} reported. */
    chat_id: string;
    /** The score itself: `1` for a positive rating, `-1` for a negative one. */
    score: 1 | -1;
    /** When the rating was created, as an ISO 8601 timestamp. */
    created_at: string;
    /** When the rating was last changed, as an ISO 8601 timestamp. */
    modified_at: string;
    /** {@link Message.id | Id of the message} that was rated. */
    message_id: string;
}

/**
 * Request payload for rating a chat message, derived from `Rating`.
 * @internal Implementation type; not part of the public SDK surface.
 */
export type RatingPayload = Omit<
    Rating,
    'owner_id' | 'id' | 'created_at' | 'modified_at' | 'created_by' | 'external_id' | 'agent_id' | 'chat_id'
>;

/**
 * What the Agents API stored when end-of-call feedback was submitted.
 *
 * Returned by {@link AgentManager.submitFeedback | submitFeedback()}, which rates the conversation
 * as a whole rather than a single answer.
 *
 * @category Chat
 */
export interface SubmitFeedbackResponse {
    /** Id of the chat the feedback belongs to — the value
     * {@link AgentManagerCallbacks.onNewChat | onNewChat} reported. */
    chat_id: string;
    /** The score that was submitted, on the agent's end-of-call scale of 1 to 5. */
    rating: number;
    /**
     * The follow-up question the user was asked, when one was recorded.
     *
     * Applications pick it from {@link EndOfCallFeedbackConfig.follow_up_messages}.
     */
    question_shown?: string;
    /** When the feedback was stored, as an ISO 8601 timestamp. */
    submitted_at: string;
}

/**
 * One renderable piece of a message: a run of text, an image, a video or a link.
 *
 * {@link parseMessageParts} splits a message's {@link Message.content | content} into these, and
 * the SDK keeps the result on {@link Message.parts}. Switch on `type` when rendering. Anything the
 * parser did not recognize is preserved verbatim as a `text` part, in its original order, and
 * nothing is dropped or reordered; a recognized image, video or link replaces the markup it was
 * written as, so the parts are not a concatenation of the original string.
 *
 * @category Chat
 */
export type MessagePart =
    | {
          /** Discriminant: plain text that the parser found no markup in. */
          type: 'text';
          /** The text itself, exactly as it appeared in {@link Message.content}. */
          text: string;
      }
    | {
          /** Discriminant: an image, from markdown image syntax such as `![alt](url)`. */
          type: 'image';
          /** URL of the image. */
          src: string;
          /** The alt text from the markdown, or an empty string when it had none. */
          alt: string;
          /**
           * `image/gif` when the URL itself ends in `.gif`, ignoring case; absent otherwise.
           *
           * The check looks at the whole URL, so a query string or fragment suppresses it —
           * `cat.gif?v=2` carries no `mimeType`. Video detection differs: it strips both before
           * looking at the extension.
           */
          mimeType?: string;
      }
    | {
          /**
           * Discriminant: a video, either from thumbnail syntax (`[![alt](thumb)](video)`) or from
           * an image whose URL ends in `.mp4`, `.webm`, `.mkv`, `.mov`, `.m4v` or `.ogv` once any
           * query string and fragment have been stripped.
           */
          type: 'video';
          /** URL of the video file. */
          src: string;
          /** The alt text from the markdown, or an empty string when it had none. */
          alt: string;
          /** URL of the poster image, when the thumbnail syntax supplied one. */
          thumbnail?: string;
      }
    | {
          /** Discriminant: a link, from markdown `[label](url)` or from an HTML `<a href>`. */
          type: 'link';
          /** Target of the link. */
          href: string;
          /** The text shown for the link. */
          label: string;
      };

/**
 * One message of a chat: what the user asked, or what the agent answered.
 *
 * The SDK keeps the whole transcript and hands a fresh copy of it to
 * {@link AgentManagerCallbacks.onNewMessage | onNewMessage} every time a message is added or
 * changed, oldest first. While an answer streams in, the last message's
 * {@link Message.content | content} and {@link Message.parts | parts} are replaced with the latest
 * text on each `partial` callback — not appended to — and are final on `answer`. The same shape is
 * accepted by {@link AgentManagerOptions.initialMessages | initialMessages} to seed a transcript.
 *
 * @category Chat
 */
export interface Message {
    /**
     * Id of this message.
     *
     * Pass it to {@link AgentManager.rate | rate()} to rate the answer. The SDK generates a random
     * id for the messages it creates locally, and uses the id sent with the message for those that
     * arrive from the agent.
     */
    id: string;
    /**
     * Who the message is from.
     *
     * The SDK itself only creates `user` (the end user) and `assistant` (the agent) messages; the
     * value on a transcribed or streamed message is whatever the server payload carried. `system`,
     * `function` and `tool` exist because the underlying chat protocol allows them.
     */
    role?: 'system' | 'assistant' | 'user' | 'function' | 'tool';
    /**
     * The message text.
     *
     * Plain text, which for agent answers may contain markdown. It is replaced by the latest text
     * on every `partial` callback while the answer streams in — and the final `answer` may be
     * shorter than the partials before it, which is exactly how the SDK spots an interruption — so
     * render it as it is rather than appending to what you rendered before.
     */
    content: string;
    /**
     * {@link Message.content | content} split into renderable pieces by {@link parseMessageParts}.
     *
     * Kept in step with `content` on every message the SDK creates, including while an answer
     * streams in. Render these instead of the raw string when the agent may answer with images,
     * videos or links; a message with no markup is a single `text` part, and an empty message is
     * an empty array.
     *
     * Optional because {@link AgentManagerOptions.initialMessages | initialMessages} take the same
     * shape, and a transcript restored from your own storage carries only the text: leave `parts`
     * out and the SDK runs the parser over `content` before the message reaches the transcript. A
     * non-empty array you built yourself is kept exactly as given. Every message the SDK delivers
     * through {@link AgentManagerCallbacks.onNewMessage | onNewMessage} has it set, seeded
     * `initialMessages` included, so a handler can read it without a guard.
     */
    parts?: MessagePart[];
    /**
     * When the message was added, as an ISO 8601 timestamp.
     *
     * Optional for the same reason as {@link Message.parts | parts} — a restored transcript need
     * not carry one — but set on every message the SDK builds itself, which is every message that
     * reaches {@link AgentManagerCallbacks.onNewMessage | onNewMessage} other than a seeded
     * {@link AgentManagerOptions.initialMessages | initialMessage} that arrived without one.
     */
    createdAt?: string;
    /**
     * The knowledge citations the answer was drawn from, as {@link RetrievalMetadata} entries.
     *
     * Present on an agent answer when the chat response carried them, so a UI can show its sources;
     * {@link AgentManager.rate | rate()} also sends them with a rating. The SDK strips this field
     * from the transcript it sends back to the Agents API with the next
     * {@link AgentManager.chat | chat()}.
     */
    matches?: ChatResponse['matches'];
    /**
     * The retrieved context the answer was generated from, as
     * {@link ChatResponse.context | the chat response} supplied it.
     *
     * Only ever set on an agent answer, and only when the answer came back from the Agents API.
     * Expressive (V4) agents chat over the data channel instead, so their answers carry no context
     * — except in {@link ChatMode.Playground}, which always takes the Agents API path.
     */
    context?: string;
    /**
     * `true` when the answer was cut short instead of being spoken to the end.
     *
     * Set on the last message by {@link AgentManager.interrupt | interrupt()}, and by the SDK when
     * the final answer turns out to be shorter than the partial text already received — which is
     * how it detects that the agent was interrupted mid-utterance.
     */
    interrupted?: boolean;
    /**
     * `true` when this user message came from speech-to-text rather than from
     * {@link AgentManager.chat | chat()}.
     *
     * It is what distinguishes an utterance the user spoke from one they typed.
     */
    transcribed?: boolean;
    /**
     * The sentiment the agent delivered this answer with, when the stream reported one.
     *
     * Taken from the metadata the server sends with the video it created, and attached to the most
     * recent agent answer. The SDK only ever fills it in from an Expressive (V4) session, and only
     * while {@link AgentManagerOptions.debug | debug} is enabled.
     */
    sentiment?: MessageSentiment;
}

/**
 * The sentiment an agent answer was delivered with, as the server reported it.
 *
 * The shape of {@link Message.sentiment}. It is an object rather than a string because the server
 * reports both the id of the sentiment it used and its name, where
 * {@link TextStreamScript.sentiment} — the sentiment the application *asks* for — is just the
 * name.
 *
 * @category Chat
 */
export interface MessageSentiment {
    /** Id of the sentiment, as the server sent it. */
    id: string;
    /** Name of the sentiment, as the server sent it. */
    name: string;
}

/**
 * Request payload for sending a chat message to the Agents API.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface ChatPayload {
    messages: Message[];
    streamId?: string;
    sessionId?: string;
    chatMode?: ChatMode;
}

/**
 * One knowledge citation: the passage of the agent's knowledge base an answer was drawn from.
 *
 * The Agents API returns these with an answer and the SDK keeps them on
 * {@link Message.matches | matches}, so a UI can show the sources behind a reply.
 *
 * @category Chat
 */
export interface RetrievalMetadata {
    /** Id of this match. Sent back with a rating as the second half of a
     * {@link Rating.matches} pair. */
    id: string;
    /** The matched passage itself, as stored in the knowledge base. */
    data: string;
    /** Title of the document the passage comes from. */
    title: string;
    /** Id of the source document. Sent back with a rating as the first half of a
     * {@link Rating.matches} pair. */
    document_id: string;
    /** Id of the knowledge base the document belongs to — the agent's {@link Agent.knowledge}. */
    knowledge_id: string;
    /** URL of the original source, for linking the citation out of the chat. */
    source_url: string;
}

/**
 * How the agent answers: with a streamed video, as text only, or not at all.
 *
 * Chosen with {@link AgentManagerOptions.mode | mode} and changed later with
 * {@link AgentManager.changeMode | changeMode()}, which reports the new value through
 * {@link AgentManagerCallbacks.onModeChange | onModeChange}. Switching to anything other than
 * {@link ChatMode.Functional} disconnects the stream, and switching *into*
 * {@link ChatMode.Functional} disconnects it too when the open session cannot carry a conversation
 * — call {@link AgentManager.connect | connect()} again after either.
 *
 * What the mode decides is narrower than it looks: whether a chat is created for the session, and
 * whether {@link AgentManager.connect | connect()} opens the notifications web socket — which is
 * exactly why a session built for one mode may not serve another. The video stream is established
 * in every mode, and every guard reads the mode the session is in at the time of the call, not the
 * one {@link createAgentManager} was given.
 *
 * The server can also answer with a different mode than the one asked for when the chat is created;
 * the SDK then adopts it and reports a {@link ChatModeDowngraded} error through
 * {@link AgentManagerCallbacks.onError | onError}.
 *
 * @category Chat
 */
export enum ChatMode {
    /**
     * Chat and video: the agent answers questions with its own LLM, in a streamed video.
     *
     * The default when {@link AgentManagerOptions.mode | mode} is omitted, and the only mode a
     * session can be in while a stream is connected and chat is available at the same time:
     * {@link AgentManager.changeMode | changeMode()} to any other value disconnects the stream.
     */
    Functional = 'Functional',
    /**
     * Text answers only: the chat works, but no video is produced.
     *
     * {@link AgentManager.chat | chat()} still returns answers through
     * {@link AgentManagerCallbacks.onNewMessage | onNewMessage}, and
     * {@link AgentManager.speak | speak()} adds a text script to the transcript but streams no
     * video: it resolves with a `duration` of `0` and an empty `videoId`.
     */
    TextOnly = 'TextOnly',
    /**
     * The agent is unavailable: {@link AgentManager.chat | chat()} throws a
     * {@link ValidationError}.
     *
     * The SDK switches to it by itself when connecting fails after its retries, so a UI can show
     * that the agent is temporarily out of service; the server can also return it when a chat is
     * created. Like {@link ChatMode.TextOnly} it produces no video.
     */
    Maintenance = 'Maintenance',
    /**
     * A text-only test conversation, used by the agent playground in D-ID Studio.
     *
     * Produces no video, and marks each chat request with a playground header so the Agents API
     * can treat it as a test. Chats in this mode always go over the Agents API, even for
     * Expressive (V4) agents, which otherwise chat over the data channel. Applications normally
     * use {@link ChatMode.Functional} or {@link ChatMode.TextOnly} instead.
     */
    Playground = 'Playground',
    /**
     * Speak-only: no chat is created for the session, while video still streams.
     *
     * Talks (V2) and Clips (V3) agents only; {@link createAgentManager} and
     * {@link AgentManager.changeMode | changeMode()} reject it with a {@link ValidationError} for
     * Expressive (V4) agents.
     *
     * {@link AgentManager.chat | chat()} rejects with a {@link ValidationError} while this is the
     * mode, however the session arrived at it. {@link AgentManager.connect | connect()} also skips
     * the notifications web socket while it is in force. Use it when the application drives the
     * agent entirely through {@link AgentManager.speak | speak()} and never asks its LLM anything.
     * The stream keeps running only when this is the mode {@link createAgentManager} was given;
     * switching into it later with {@link AgentManager.changeMode | changeMode()} disconnects the
     * stream like any other non-{@link ChatMode.Functional} mode.
     */
    DirectPlayback = 'DirectPlayback',
    /**
     * Chat is switched off: no chat is created for the session, while video still streams.
     *
     * Talks (V2) and Clips (V3) agents only; {@link createAgentManager} and
     * {@link AgentManager.changeMode | changeMode()} reject it with a {@link ValidationError} for
     * Expressive (V4) agents.
     *
     * {@link AgentManager.chat | chat()} rejects with a {@link ValidationError} while this is the
     * mode, exactly as in {@link ChatMode.DirectPlayback}. The one difference between the two is
     * the notifications web socket: this mode still opens it on a Talks (V2) or Clips (V3) agent,
     * where {@link ChatMode.DirectPlayback} skips it. As with {@link ChatMode.DirectPlayback}, the
     * stream keeps running only when this is the mode set at creation; switching into it later with
     * {@link AgentManager.changeMode | changeMode()} disconnects the stream.
     */
    Off = 'Off',
}

/**
 * What the Agents API answers a chat request with.
 *
 * Returned by {@link AgentManager.chat | chat()}. The SDK has already added the answer to the
 * transcript by the time you get it, so most applications render
 * {@link AgentManagerCallbacks.onNewMessage | onNewMessage} instead and use this only for the
 * fields that never reach a {@link Message}. Expressive (V4) agents chat over the data channel
 * rather than over the Agents API — except in {@link ChatMode.Playground} — so for them the
 * object is empty and the answer arrives through the callback.
 *
 * @category Chat
 */
export interface ChatResponse {
    /**
     * The agent's answer.
     *
     * Empty or absent when the answer is delivered as it is generated instead, which is what
     * streaming modes do; the SDK then adds no message for it and the text arrives through
     * {@link AgentManagerCallbacks.onNewMessage | onNewMessage}.
     */
    result?: string;
    /**
     * The Agents API's own list of ids for the documents behind the answer. The SDK never reads it;
     * {@link ChatResponse.matches | matches} is what it keeps on the message.
     */
    documentIds?: string[];
    /**
     * The knowledge citations behind the answer.
     *
     * Copied onto the answer as {@link Message.matches | matches}.
     */
    matches?: RetrievalMetadata[];
    /**
     * The {@link ChatMode} the server handled the request in.
     *
     * It can differ from the mode that was asked for — see {@link ChatMode}.
     */
    chatMode?: ChatMode;
    /**
     * The retrieved context the answer was generated from.
     *
     * Copied onto the answer as {@link Message.context | context}.
     */
    context?: string;
    /** Id of the video generated for the answer, when the server reported one. */
    videoId?: string;
}

/**
 * A conversation with an agent, as the Agents API stores it.
 * @internal Wire type of the Agents API; not part of the public SDK surface. The only part an
 * application sees is the chat id, reported by
 * {@link AgentManagerCallbacks.onNewChat | onNewChat}.
 */
export interface Chat {
    /** Id of the chat. The value handed to
     * {@link AgentManagerCallbacks.onNewChat | onNewChat}. */
    id: string;
    /** Id of the agent this conversation is with. */
    agent_id: string;
    /** When the chat was created, as an ISO 8601 timestamp. */
    created: string;
    /** When the chat was last changed, as an ISO 8601 timestamp. */
    modified: string;
    /** Id of the D-ID account that owns the chat. Set by the API; on the synthetic chat the SDK
     * builds for an Expressive (V4) session it is copied from {@link Agent.owner_id}. */
    owner_id: string;
    /**
     * The messages stored with the chat.
     *
     * The SDK never reads this array — the live transcript is the one handed to
     * {@link AgentManagerCallbacks.onNewMessage | onNewMessage} — and it is empty on the chat the
     * SDK builds for an Expressive (V4) session.
     */
    messages: Message[];
    /** A composite sort key the API uses to list an agent's chats by creation time. Not meaningful
     * to clients. */
    agent_id__created_at: string;
    /** A composite sort key the API uses to list an agent's chats by modification time. Not
     * meaningful to clients. */
    agent_id__modified_at: string;
    /**
     * The {@link ChatMode} the chat was created in.
     *
     * {@link AgentManager.connect | connect()} adopts it, which is how the server can downgrade the
     * mode an application asked for.
     */
    chat_mode?: ChatMode;
}

/**
 * What caused the user to interrupt the agent, passed to
 * {@link AgentManager.interrupt | interrupt()}.
 *
 * @category Chat
 */
export interface InterruptOptions {
    /**
     * The cause: `text` when the user typed over the answer, `audio` when they started speaking,
     * `click` when they pressed a stop control, and `manual` for an interruption the application
     * decided on itself.
     *
     * The SDK records it with the interruption for analytics. It changes behavior in one case
     * only: Expressive (V4) agents ignore a `text` interrupt, because their orchestrator does not
     * cancel the answer already in flight. Talks (V2) and Clips (V3) agents interrupt the current
     * video whatever the value.
     */
    type: 'text' | 'audio' | 'click' | 'manual';
}
