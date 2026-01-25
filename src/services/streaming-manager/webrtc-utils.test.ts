/**
 * Utility function tests for streaming manager
 * Tests helper functions like mapConnectionState and parseDataChannelMessage
 */

import { ConnectionState } from '../../types/index';
import { createParseDataChannelMessage, mapConnectionState } from './webrtc-manager';

// Mock dependencies to avoid import issues
jest.mock('../../api/streams', () => ({ createStreamApi: jest.fn() }));
jest.mock('./stats/poll', () => ({
    createVideoStatsMonitor: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        getReport: jest.fn(() => ({})),
    })),
}));
jest.mock('../../config/environment', () => ({ didApiUrl: 'http://test-api.com' }));

describe('Streaming Manager Utilities', () => {
    const parseDataChannelMessage = createParseDataChannelMessage(jest.fn());
    describe('mapConnectionState', () => {
        it('should map all RTCIceConnectionState values correctly', () => {
            expect(mapConnectionState('connected')).toBe(ConnectionState.Connected);
            expect(mapConnectionState('checking')).toBe(ConnectionState.Connecting);
            expect(mapConnectionState('failed')).toBe(ConnectionState.Fail);
            expect(mapConnectionState('new')).toBe(ConnectionState.New);
            expect(mapConnectionState('closed')).toBe(ConnectionState.Closed);
            expect(mapConnectionState('disconnected')).toBe(ConnectionState.Disconnected);
            expect(mapConnectionState('completed')).toBe(ConnectionState.Completed);
        });

        it('should handle unknown connection states', () => {
            expect(mapConnectionState('unknown' as any)).toBe(ConnectionState.New);
            expect(mapConnectionState('invalid-state' as any)).toBe(ConnectionState.New);
        });
    });

    describe('parseDataChannelMessage', () => {
        it('should parse valid JSON data', () => {
            const message = 'StreamStarted:{"metadata":{"videoId":"123"}}';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('StreamStarted');
            expect(result.data).toEqual({ metadata: { videoId: '123' } });
        });

        it('should parse message with string data', () => {
            const message = 'StreamReady:simple-string-data';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('StreamReady');
            expect(result.data).toBe('simple-string-data');
        });

        it('should handle message without data', () => {
            const message = 'StreamDone';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('StreamDone');
            expect(result.data).toBe('');
        });

        it('should handle invalid JSON gracefully', () => {
            const message = 'StreamStarted:{invalid-json}';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('StreamStarted');
            expect(result.data).toBe('{invalid-json}');
        });

        it('should handle complex message with colons in data', () => {
            const message = 'StreamStarted:{"url":"http://example.com:8080/path"}';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('StreamStarted');
            expect(result.data).toEqual({ url: 'http://example.com:8080/path' });
        });

        it('should handle empty message', () => {
            const message = '';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('');
            expect(result.data).toBe('');
        });

        it('should handle StreamDone with video_id', () => {
            const message = 'StreamDone:{"video_id":"video-123"}';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('StreamDone');
            expect(result.data).toEqual({ video_id: 'video-123' });
        });

        it('should handle StreamStarted with video_id and metadata', () => {
            const message = 'StreamStarted:{"metadata":{"videoId":"video123"},"video_id":"video-123"}';
            const result = parseDataChannelMessage(message);

            expect(result.subject).toBe('StreamStarted');
            expect(result.data).toEqual({ metadata: { videoId: 'video123' }, video_id: 'video-123' });
        });

        it('should parse message with different payload types', () => {
            // Test StreamStarted without metadata object
            const result1 = parseDataChannelMessage('StreamStarted:{"other":"data"}');
            expect(result1.subject).toBe('StreamStarted');
            expect(result1.data).toEqual({ other: 'data' });

            // Test StreamStarted with string payload
            const result2 = parseDataChannelMessage('StreamStarted:simple-string');
            expect(result2.subject).toBe('StreamStarted');
            expect(result2.data).toBe('simple-string');
        });

        it('should handle different stream ready events', () => {
            const result1 = parseDataChannelMessage('StreamReady:{"ready":true}');
            expect(result1.subject).toBe('StreamReady');
            expect(result1.data).toEqual({ ready: true });

            const result2 = parseDataChannelMessage('StreamReady:ready-string');
            expect(result2.subject).toBe('StreamReady');
            expect(result2.data).toBe('ready-string');
        });

        it('should test parseDataChannelMessage branches', () => {
            // Test valid JSON parsing
            let result = parseDataChannelMessage('StreamStarted:{"valid":true}');
            expect(result.subject).toBe('StreamStarted');
            expect(result.data).toEqual({ valid: true });

            // Test invalid JSON parsing
            result = parseDataChannelMessage('StreamStarted:{invalid}');
            expect(result.subject).toBe('StreamStarted');
            expect(result.data).toBe('{invalid}');

            // Test message without colon
            result = parseDataChannelMessage('StreamDone');
            expect(result.subject).toBe('StreamDone');
            expect(result.data).toBe('');

            // Test empty message
            result = parseDataChannelMessage('');
            expect(result.subject).toBe('');
            expect(result.data).toBe('');
        });
    });
});
