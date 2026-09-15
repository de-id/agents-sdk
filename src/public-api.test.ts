jest.mock('@sdk/config/environment', () => ({
    nodeEnv: 'test',
    didApiUrl: 'http://localhost',
    didSocketApiUrl: 'ws://localhost',
    mixpanelKey: '',
    agentId: '',
}));

import * as sdk from './index';

/**
 * Runtime exports of the package root (enums, classes, functions, consts).
 * Types are erased and are not listed here. If you change this list you are
 * changing the public API: that requires a major version and a MIGRATION.md entry.
 * Changed in 3.0.0: the five enums reachable only through the old types barrel are no
 * longer exported from the root (see MIGRATION.md).
 */
const RUNTIME_EXPORTS = [
    'AgentActivityState',
    'BaseError',
    'ChatCreationFailed',
    'ChatMode',
    'ChatModeDowngraded',
    'ConnectionState',
    'ConnectivityState',
    'HttpError',
    'NetworkError',
    'Providers',
    'PublicDataChannelTopic',
    'RateState',
    'SDK_VERSION',
    'StreamEndReason',
    'StreamError',
    'StreamEvents',
    'StreamType',
    'StreamingState',
    'ValidationError',
    'VideoType',
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
});
