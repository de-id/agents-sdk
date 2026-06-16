import { AvSyncAnomaly, AvSyncReport, AvSyncSample, SlimRTCStatsReport } from '@sdk/types';

const CONVERGED_THRESHOLD_MS = 100;

const round = (value: number) => Math.round(value);
const round2 = (value: number) => Math.round(value * 100) / 100;
const percentile = (sorted: number[], p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];

function detectAvSyncAnomalies(report: Omit<AvSyncReport, 'anomalies'>): AvSyncAnomaly[] {
    const anomalies: AvSyncAnomaly[] = [];
    const add = (condition: boolean, type: string, severity: AvSyncAnomaly['severity'], detail: string) => {
        if (condition) {
            anomalies.push({ type, severity, detail });
        }
    };
    const srBroken = (ratio: number | null) =>
        ratio !== null && (ratio === 0 || !isFinite(ratio) || Math.abs(ratio - 1) > 0.5);

    add(
        srBroken(report.srClockRatioAudio) || srBroken(report.srClockRatioVideo),
        'broken-sr-clock',
        'high',
        `SR clock ratio audio ${report.srClockRatioAudio} / video ${report.srClockRatioVideo} (expected ~1.0)`
    );
    add(
        report.maxAbsDriftMs > 5000,
        'unbounded-drift',
        'high',
        `max drift ${report.maxAbsDriftMs}ms (broken sync metadata)`
    );
    add(
        report.timeToSyncMs === null,
        'never-converged',
        'high',
        `offset never reached <${CONVERGED_THRESHOLD_MS}ms in ${report.durationMs}ms`
    );
    add(
        report.timeToSyncMs !== null && report.timeToSyncMs > 2000,
        'slow-start-convergence',
        'medium',
        `took ${report.timeToSyncMs}ms to reach <${CONVERGED_THRESHOLD_MS}ms`
    );
    add(
        report.residualOffsetMs > 120,
        'residual-drift',
        'medium',
        `steady-state |offset| ${report.residualOffsetMs}ms`
    );
    add(
        report.srSkewMs !== null && Math.abs(report.srSkewMs) > 200,
        'sr-clock-skew',
        'medium',
        `audio/video SR skew ${report.srSkewMs}ms`
    );
    add(
        report.syncSlackMs > 80,
        'excess-sync-buffering',
        'medium',
        `sync buffering ${report.syncSlackMs}ms (player padding to align)`
    );
    return anomalies;
}

export function buildAvSyncReport(stats: SlimRTCStatsReport[]): AvSyncReport | null {
    const samples = stats
        .map(stat => stat.av)
        .filter((sample): sample is AvSyncSample => !!sample && sample.audioPlayout > 0 && sample.videoPlayout > 0);

    if (samples.length < 2) {
        return null;
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    const start = first.localTs;
    const durationMs = last.localTs - start;

    const drifts = samples.map(sample => sample.audioPlayout - sample.videoPlayout);
    const absSorted = drifts.map(Math.abs).sort((a, b) => a - b);
    const signedSorted = [...drifts].sort((a, b) => a - b);

    const convergedSample = samples.find(
        sample => Math.abs(sample.audioPlayout - sample.videoPlayout) < CONVERGED_THRESHOLD_MS
    );
    const timeToSyncMs = convergedSample ? round(convergedSample.localTs - start) : null;

    const steady = samples.filter(sample => sample.localTs - start >= Math.min(5000, durationMs / 2));
    const steadyAbs = (steady.length ? steady : samples)
        .map(sample => Math.abs(sample.audioPlayout - sample.videoPlayout))
        .sort((a, b) => a - b);
    const residualOffsetMs = round(steadyAbs[Math.floor(steadyAbs.length / 2)]);

    const avg = (deltaDelay: number, deltaCount: number) => (deltaCount > 0 ? (deltaDelay / deltaCount) * 1000 : 0);
    const audioJb = avg(last.audioJbDelay - first.audioJbDelay, last.audioJbCount - first.audioJbCount);
    const videoJb = avg(last.videoJbDelay - first.videoJbDelay, last.videoJbCount - first.videoJbCount);
    const audioTarget = avg(last.audioJbTarget - first.audioJbTarget, last.audioJbCount - first.audioJbCount);
    const audioMin = avg(last.audioJbMin - first.audioJbMin, last.audioJbCount - first.audioJbCount);

    const deltaLocal = last.localTs - first.localTs;
    const ratio = (deltaRemote: number) => (deltaLocal > 0 ? round2(deltaRemote / deltaLocal) : 0);
    const hasAudioSr = first.srAudioRemoteTs > 0 && last.srAudioRemoteTs > 0;
    const hasVideoSr = first.srVideoRemoteTs > 0 && last.srVideoRemoteTs > 0;

    const lossPct = (deltaLost: number, deltaReceived: number) =>
        deltaLost + deltaReceived > 0 ? (100 * deltaLost) / (deltaLost + deltaReceived) : 0;

    const summary = {
        sampleCount: samples.length,
        durationMs: round(durationMs),
        offsetMedianMs: round(percentile(signedSorted, 0.5)),
        offsetP95Ms: round(percentile(absSorted, 0.95)),
        residualOffsetMs,
        maxAbsDriftMs: round(percentile(absSorted, 1)),
        startOffsetMs: round(drifts[0]),
        timeToSyncMs,
        audioLeadPct: round((100 * drifts.filter(drift => drift > 0).length) / drifts.length),
        syncSlackMs: round(audioTarget - audioMin),
        jbGapMs: round(audioJb - videoJb),
        audioRetimeMs: round((last.audioAccel - first.audioAccel - (last.audioDecel - first.audioDecel)) / 48),
        srClockRatioAudio: hasAudioSr ? ratio(last.srAudioRemoteTs - first.srAudioRemoteTs) : null,
        srClockRatioVideo: hasVideoSr ? ratio(last.srVideoRemoteTs - first.srVideoRemoteTs) : null,
        srSkewMs: hasAudioSr && hasVideoSr ? round(last.srAudioRemoteTs - last.srVideoRemoteTs) : null,
        concealMs: round((last.audioConcealed - first.audioConcealed) / 48),
        audioLossPct: round2(
            lossPct(
                last.audioPacketsLost - first.audioPacketsLost,
                last.audioPacketsReceived - first.audioPacketsReceived
            )
        ),
        audioJitterMs: round(last.audioJitter * 1000),
    };

    return { ...summary, anomalies: detectAvSyncAnomalies(summary) };
}
