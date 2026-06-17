import { AvSyncReport, AvSyncSample, SlimRTCStatsReport } from '@sdk/types';
import { median, round } from '@sdk/utils/analytics';

// Perceptibility thresholds (ITU/EBU): audio ahead of video is less tolerable than audio behind.
const AUDIO_LEAD_PERCEPTIBLE_MS = 45;
const AUDIO_LAG_PERCEPTIBLE_MS = 100;

export function buildAvSyncReport(stats: SlimRTCStatsReport[]): AvSyncReport | null {
    const samples = stats
        .map(stat => stat.av)
        .filter((sample): sample is AvSyncSample => !!sample && sample.audioPlayout > 0 && sample.videoPlayout > 0);

    if (samples.length < 2) {
        return null;
    }

    const start = samples[0].localTs;
    const durationMs = samples[samples.length - 1].localTs - start;
    const offsets = samples.map(sample => sample.audioPlayout - sample.videoPlayout);

    const perceptible = offsets.filter(
        offset => offset > AUDIO_LEAD_PERCEPTIBLE_MS || offset < -AUDIO_LAG_PERCEPTIBLE_MS
    );
    const steady = samples.filter(sample => sample.localTs - start >= Math.min(5000, durationMs / 2));
    const steadyOffsets = (steady.length ? steady : samples).map(sample => sample.audioPlayout - sample.videoPlayout);

    return {
        sampleCount: samples.length,
        durationMs: round(durationMs),
        desyncDurationMs: round(durationMs * (perceptible.length / offsets.length)),
        maxOffsetMs: round(offsets.reduce((worst, offset) => (Math.abs(offset) > Math.abs(worst) ? offset : worst))),
        residualOffsetMs: round(median(steadyOffsets)),
    };
}
