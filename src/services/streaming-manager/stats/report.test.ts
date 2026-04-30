import { formatStats } from './report';

type StatEntry = Record<string, any>;

function buildStats(entries: StatEntry[]): RTCStatsReport {
    const map = new Map<string, StatEntry>();
    for (const entry of entries) {
        map.set(entry.id, entry);
    }
    return map as unknown as RTCStatsReport;
}

const inboundRtpVideo: StatEntry = {
    id: 'IT_video',
    type: 'inbound-rtp',
    kind: 'video',
    codecId: 'CIT_video_vp8',
    timestamp: 1_700_000_000_000,
    bytesReceived: 1_234_567,
    packetsReceived: 1_000,
    packetsLost: 2,
    framesDropped: 1,
    framesDecoded: 600,
    jitter: 0.01,
    jitterBufferDelay: 30,
    jitterBufferEmittedCount: 600,
    frameWidth: 1280,
    frameHeight: 720,
    framesPerSecond: 30,
    freezeCount: 0,
    totalFreezesDuration: 0,
};

const codecVp8: StatEntry = { id: 'CIT_video_vp8', type: 'codec', mimeType: 'video/VP8' };
const codecH264: StatEntry = { id: 'CIT_video_h264', type: 'codec', mimeType: 'video/H264' };
const codecAudio: StatEntry = { id: 'CIT_audio_opus', type: 'codec', mimeType: 'audio/opus' };
const inboundRtpAudio: StatEntry = { id: 'IT_audio', type: 'inbound-rtp', kind: 'audio' };

const nominatedPair: StatEntry = {
    id: 'CP_nominated',
    type: 'candidate-pair',
    nominated: true,
    currentRoundTripTime: 0.05,
};
const backupPair: StatEntry = {
    id: 'CP_backup',
    type: 'candidate-pair',
    nominated: false,
    currentRoundTripTime: 0.2,
};

describe('formatStats', () => {
    describe('codec extraction', () => {
        it.each([
            ['codec stat is iterated before inbound-rtp video', [codecVp8, inboundRtpVideo]],
            ['codec stat is iterated after inbound-rtp video', [inboundRtpVideo, codecVp8]],
        ])('returns the codec when %s', (_label, entries) => {
            expect(formatStats(buildStats(entries)).codec).toBe('VP8');
        });

        it('returns the codec linked by codecId when multiple video codecs exist', () => {
            const inboundUsingH264 = { ...inboundRtpVideo, codecId: codecH264.id };
            expect(formatStats(buildStats([codecVp8, codecH264, inboundUsingH264])).codec).toBe('H264');
        });

        it.each([
            ['codecId does not match any codec entry', [codecVp8, { ...inboundRtpVideo, codecId: 'unknown-id' }]],
            [
                'inbound-rtp omits codecId entirely',
                [
                    codecVp8,
                    (() => {
                        const { codecId, ...rest } = inboundRtpVideo;
                        return rest;
                    })(),
                ],
            ],
        ])('falls back to any video codec when %s', (_label, entries) => {
            expect(formatStats(buildStats(entries)).codec).toBe('VP8');
        });

        it('ignores audio codec entries when picking a video codec', () => {
            expect(formatStats(buildStats([codecAudio, codecVp8, inboundRtpVideo])).codec).toBe('VP8');
        });

        it('returns an empty codec string when no video codec is present', () => {
            const inboundNoLink = { ...inboundRtpVideo, codecId: undefined };
            expect(formatStats(buildStats([codecAudio, inboundNoLink])).codec).toBe('');
        });

        it('does not throw when a codec entry has no mimeType', () => {
            const malformed = { id: 'CIT_bad', type: 'codec' };
            expect(() => formatStats(buildStats([malformed, inboundRtpVideo]))).not.toThrow();
        });
    });

    describe('inbound-rtp routing', () => {
        it('returns an empty report when no video inbound-rtp is present', () => {
            expect(formatStats(buildStats([codecVp8, inboundRtpAudio]))).toEqual({});
        });

        it('passes inbound-rtp fields through to the result', () => {
            const result = formatStats(buildStats([codecVp8, inboundRtpVideo]));
            expect(result).toMatchObject({
                codec: 'VP8',
                timestamp: inboundRtpVideo.timestamp,
                bytesReceived: inboundRtpVideo.bytesReceived,
                packetsReceived: inboundRtpVideo.packetsReceived,
                packetsLost: inboundRtpVideo.packetsLost,
                framesDropped: inboundRtpVideo.framesDropped,
                framesDecoded: inboundRtpVideo.framesDecoded,
                jitter: inboundRtpVideo.jitter,
                jitterBufferDelay: inboundRtpVideo.jitterBufferDelay,
                jitterBufferEmittedCount: inboundRtpVideo.jitterBufferEmittedCount,
                frameWidth: inboundRtpVideo.frameWidth,
                frameHeight: inboundRtpVideo.frameHeight,
                framesPerSecond: inboundRtpVideo.framesPerSecond,
                freezeCount: inboundRtpVideo.freezeCount,
                freezeDuration: inboundRtpVideo.totalFreezesDuration,
            });
        });

        it('derives avgJitterDelayInInterval as jitterBufferDelay / jitterBufferEmittedCount', () => {
            const result = formatStats(buildStats([codecVp8, inboundRtpVideo]));
            expect(result.avgJitterDelayInInterval).toBeCloseTo(
                inboundRtpVideo.jitterBufferDelay / inboundRtpVideo.jitterBufferEmittedCount
            );
        });
    });

    describe('RTT priority', () => {
        function rttFromPairs(pairs: StatEntry[]): number {
            return formatStats(buildStats([...pairs, codecVp8, inboundRtpVideo])).rtt;
        }

        it('uses the nominated pair when no other pair is present', () => {
            expect(rttFromPairs([nominatedPair])).toBe(nominatedPair.currentRoundTripTime);
        });

        it('uses the nominated pair when a backup pair appears before it', () => {
            expect(rttFromPairs([backupPair, nominatedPair])).toBe(nominatedPair.currentRoundTripTime);
        });

        it('keeps the nominated pair when a backup pair appears after it', () => {
            expect(rttFromPairs([nominatedPair, backupPair])).toBe(nominatedPair.currentRoundTripTime);
        });

        it('uses the backup pair when no nominated pair is present', () => {
            expect(rttFromPairs([backupPair])).toBe(backupPair.currentRoundTripTime);
        });

        it('ignores candidate-pair entries with non-positive RTT', () => {
            const zeroRttPair = { ...backupPair, currentRoundTripTime: 0 };
            expect(rttFromPairs([zeroRttPair])).toBe(0);
        });
    });
});
