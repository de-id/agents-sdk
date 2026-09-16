jest.mock('@sdk/config/environment', () => ({
    nodeEnv: 'test',
    didApiUrl: 'http://localhost',
    didSocketApiUrl: 'ws://localhost',
    mixpanelKey: '',
    agentId: '',
}));

import * as sdk from './index';
import { StreamEvents, ToolCallEvent } from './types/stream/stream';

/**
 * Runtime exports of the package root (enums, classes, functions, consts).
 * Types are erased and are not listed here. If you change this list you are
 * changing the public API: that requires a major version and a MIGRATION.md entry.
 * Changed in 3.0.0: the five enums reachable only through the old types barrel are no
 * longer exported from the root (see MIGRATION.md). 3.0.0 also removed `SDK_VERSION`
 * (internal analytics value).
 */
const RUNTIME_EXPORTS = [
    'AgentActivityState',
    'BaseError',
    'ChatCreationFailed',
    'ChatMode',
    'ChatModeDowngraded',
    'ConnectionState',
    'ConnectivityState',
    'DataChannelTopic',
    'HttpError',
    'NetworkError',
    'Providers',
    'StreamEndReason',
    'StreamError',
    'StreamType',
    'StreamingState',
    'ToolCallEvent',
    'ValidationError',
    'AvatarType',
    'VoiceAccess',
    'WsError',
    'createAgentManager',
    'isAwaitingTool',
    'isDIDError',
    'parseMessageParts',
].sort();

describe('Public API', () => {
    it('Should export exactly the known runtime symbols from the package root', () => {
        const actual = Object.keys(sdk).sort();

        expect(actual).toEqual(RUNTIME_EXPORTS);
    });

    /**
     * The public enum and the internal one the data channel dispatches on are declared separately.
     * They must carry the same wire strings, or onToolEvent would report an event value no
     * comparison against ToolCallEvent can match.
     */
    it('Should give ToolCallEvent the same wire strings as the internal StreamEvents members', () => {
        expect([ToolCallEvent.Started, ToolCallEvent.Done, ToolCallEvent.Error]).toEqual([
            StreamEvents.ToolCallStarted,
            StreamEvents.ToolCallDone,
            StreamEvents.ToolCallError,
        ]);
    });
});
