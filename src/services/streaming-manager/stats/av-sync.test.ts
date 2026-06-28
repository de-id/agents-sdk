import { SlimRTCStatsReport } from '@sdk/types';
import { buildAvSyncReport } from './av-sync';

const VIDEO_PLAYOUT = 3_800_000_000_000;

// A measurable sample: audio leads video by `offsetMs` (positive = audio ahead), at local time `localTs`.
const sample = (localTs: number, offsetMs: number): SlimRTCStatsReport =>
    ({
        av: { audioPlayout: VIDEO_PLAYOUT + offsetMs, videoPlayout: VIDEO_PLAYOUT, localTs },
    }) as unknown as SlimRTCStatsReport;

// A sample with no usable playout — should be filtered out.
const unpaired = (localTs: number): SlimRTCStatsReport =>
    ({ av: { audioPlayout: 0, videoPlayout: VIDEO_PLAYOUT, localTs } }) as unknown as SlimRTCStatsReport;

const noAv = (): SlimRTCStatsReport => ({}) as SlimRTCStatsReport;

const series = (offsets: number[], stepMs = 100): SlimRTCStatsReport[] =>
    offsets.map((offset, index) => sample(index * stepMs, offset));

describe('buildAvSyncReport', () => {
    it('returns null when there are fewer than two measurable samples', () => {
        expect(buildAvSyncReport([])).toBeNull();
        expect(buildAvSyncReport([sample(0, 10)])).toBeNull();
        expect(buildAvSyncReport([noAv(), noAv()])).toBeNull();
        expect(buildAvSyncReport([sample(0, 10), unpaired(100)])).toBeNull();
    });

    it('counts only paired samples and measures the window from their local timestamps', () => {
        const report = buildAvSyncReport([sample(0, 10), unpaired(100), sample(200, 10)]);
        expect(report).not.toBeNull();
        expect(report!.sampleCount).toBe(2);
        expect(report!.durationMs).toBe(200);
    });

    it('reports zero desync when every offset is within perceptibility (incl. audio slightly behind)', () => {
        // +10 (well under +45) and -80 (within the -100 audio-behind tolerance)
        const report = buildAvSyncReport(series([10, -80, 10, -80]));
        expect(report!.desyncDurationMs).toBe(0);
    });

    it('reports desync across the whole window when every offset is perceptible', () => {
        const report = buildAvSyncReport(series([1000, 1000, 1000])); // duration 200
        expect(report!.durationMs).toBe(200);
        expect(report!.desyncDurationMs).toBe(200);
    });

    it('weights audio-lead more strictly than audio-lag (asymmetric thresholds)', () => {
        // +50 perceptible (>45); -50 NOT (within -100); -150 perceptible (<-100); +10 NOT
        const report = buildAvSyncReport(series([50, -50, -150, 10])); // 4 samples, duration 300
        expect(report!.desyncDurationMs).toBe(150); // 2 of 4 perceptible -> 300 * 0.5
    });

    it('maxOffsetMs is the largest-magnitude offset, kept signed', () => {
        const report = buildAvSyncReport(series([30, -200, 50]));
        expect(report!.maxOffsetMs).toBe(-200);
    });

    it('residualOffsetMs reflects a persistent offset', () => {
        const report = buildAvSyncReport(series([1786, 1786, 1786, 1786]));
        expect(report!.residualOffsetMs).toBe(1786);
    });

    it('residualOffsetMs is ~0 when a large startup offset recovers, but desync was still flagged', () => {
        // first half ~ +2000, second half 0; steady window = back half
        const report = buildAvSyncReport(series([2000, 2000, 2000, 2000, 2000, 0, 0, 0, 0, 0]));
        expect(report!.residualOffsetMs).toBe(0);
        expect(report!.desyncDurationMs).toBeGreaterThan(0);
        expect(report!.maxOffsetMs).toBe(2000);
    });
});
