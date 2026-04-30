import { AnalyticsRTCStatsReport, SlimRTCStatsReport } from '@sdk/types';
import { average } from '@sdk/utils/analytics';

export interface VideoRTCStatsReport {
    webRTCStats: {
        anomalies: AnalyticsRTCStatsReport[];
        aggregateReport: AnalyticsRTCStatsReport;
        minRtt: number;
        maxRtt: number;
        avgRtt: number;
        minJitterDelayInInterval: number;
        maxJitterDelayInInterval: number;
        avgJitterDelayInInterval: number;
    };
    codec: string;
    resolution: string;
}

function createAggregateReport(
    start: SlimRTCStatsReport,
    end: SlimRTCStatsReport,
    lowFpsCount: number
): AnalyticsRTCStatsReport {
    const duration = (end.timestamp - start.timestamp) / 1000;
    return {
        duration,
        bytesReceived: end.bytesReceived - start.bytesReceived,
        bitrate: Math.round(((end.bytesReceived - start.bytesReceived) * 8) / duration),
        packetsReceived: end.packetsReceived - start.packetsReceived,
        packetsLost: end.packetsLost - start.packetsLost,
        framesDropped: end.framesDropped - start.framesDropped,
        framesDecoded: end.framesDecoded - start.framesDecoded,
        jitter: end.jitter,
        avgJitterDelayInInterval:
            (end.jitterBufferDelay - start.jitterBufferDelay) /
            (end.jitterBufferEmittedCount - start.jitterBufferEmittedCount),
        jitterBufferEmittedCount: end.jitterBufferEmittedCount - start.jitterBufferEmittedCount,
        jitterBufferDelay: (end.jitterBufferDelay - start.jitterBufferDelay) / duration,
        framesPerSecond: end.framesPerSecond,
        freezeCount: end.freezeCount - start.freezeCount,
        freezeDuration: end.freezeDuration - start.freezeDuration,
        lowFpsCount,
    };
}

function extractAnomalies(stats: AnalyticsRTCStatsReport[]): AnalyticsRTCStatsReport[] {
    return stats
        .filter(
            report =>
                report.freezeCount > 0 ||
                report.framesPerSecond < 21 ||
                report.framesDropped > 0 ||
                report.packetsLost > 0
        )
        .map(report => {
            const { timestamp, ...updatedReport } = report;
            const causes: string[] = [];
            if (report.freezeCount > 0) {
                causes.push('freeze');
            }
            if (report.framesPerSecond < 21) {
                causes.push('low fps');
            }
            if (report.framesDropped > 0) {
                causes.push('frames dropped');
            }
            if (report.packetsLost > 0) {
                causes.push('packet loss');
            }
            return {
                ...updatedReport,
                causes,
            };
        });
}

export function formatStats(stats: RTCStatsReport): SlimRTCStatsReport {
    let codec = '';
    let currRtt: number = 0;
    let videoInboundRtp: RTCInboundRtpStreamStats | null = null;
    const codecIdToMime = new Map<string, string>();

    // RTCStatsReport iteration order is not guaranteed across browsers.
    // Walk the full report once to collect codec/rtt/inbound-rtp before returning,
    // otherwise we may return before the codec entry is seen and emit codec=''.
    for (const report of stats.values()) {
        if (!report) continue;

        if (report.type === 'codec' && report.mimeType?.startsWith('video')) {
            codecIdToMime.set(report.id, report.mimeType.split('/')[1]);
        } else if (report.type === 'candidate-pair') {
            const pair = report as RTCIceCandidatePairStats;
            const rtt = pair.currentRoundTripTime ?? 0;
            // Prefer RTT from the nominated candidate-pair (the active connection path).
            // Fall back to the first valid pair only until a nominated value arrives.
            if (rtt > 0) {
                if (pair.nominated === true) {
                    currRtt = rtt;
                } else if (currRtt === 0) {
                    currRtt = rtt;
                }
            }
        } else if (report.type === 'inbound-rtp' && report.kind === 'video') {
            videoInboundRtp = report as RTCInboundRtpStreamStats;
        }
    }

    if (!videoInboundRtp) {
        return {} as SlimRTCStatsReport;
    }

    // WebRTC marks every numeric field optional, but SlimRTCStatsReport expects
    // required values. Single boundary cast avoids per-field null checks below.
    const inbound = videoInboundRtp as Required<RTCInboundRtpStreamStats>;

    if (inbound.codecId && codecIdToMime.has(inbound.codecId)) {
        codec = codecIdToMime.get(inbound.codecId)!;
    } else if (codecIdToMime.size > 0) {
        codec = codecIdToMime.values().next().value ?? '';
    }

    return {
        codec,
        rtt: currRtt,
        timestamp: inbound.timestamp,
        bytesReceived: inbound.bytesReceived,
        packetsReceived: inbound.packetsReceived,
        packetsLost: inbound.packetsLost,
        framesDropped: inbound.framesDropped,
        framesDecoded: inbound.framesDecoded,
        jitter: inbound.jitter,
        jitterBufferDelay: inbound.jitterBufferDelay,
        jitterBufferEmittedCount: inbound.jitterBufferEmittedCount,
        avgJitterDelayInInterval: inbound.jitterBufferDelay / inbound.jitterBufferEmittedCount,
        frameWidth: inbound.frameWidth,
        frameHeight: inbound.frameHeight,
        framesPerSecond: inbound.framesPerSecond,
        freezeCount: inbound.freezeCount,
        freezeDuration: inbound.totalFreezesDuration,
    } as SlimRTCStatsReport;
}

export function createVideoStatsReport(
    stats: SlimRTCStatsReport[],
    interval: number,
    previousStats?: SlimRTCStatsReport
): VideoRTCStatsReport {
    const differentialReport = stats.map((report, index) => {
        if (index === 0) {
            if (!previousStats) {
                return {
                    timestamp: report.timestamp,
                    rtt: report.rtt,
                    duration: 0,
                    bytesReceived: report.bytesReceived,
                    bitrate: (report.bytesReceived * 8) / (interval / 1000),
                    packetsReceived: report.packetsReceived,
                    packetsLost: report.packetsLost,
                    framesDropped: report.framesDropped,
                    framesDecoded: report.framesDecoded,
                    jitter: report.jitter,
                    jitterBufferDelay: report.jitterBufferDelay,
                    jitterBufferEmittedCount: report.jitterBufferEmittedCount,
                    avgJitterDelayInInterval: report.jitterBufferDelay / report.jitterBufferEmittedCount,
                    framesPerSecond: report.framesPerSecond,
                    freezeCount: report.freezeCount,
                    freezeDuration: report.freezeDuration,
                };
            }

            return {
                timestamp: report.timestamp,
                duration: 0,
                rtt: report.rtt,
                bytesReceived: report.bytesReceived - previousStats.bytesReceived,
                bitrate: ((report.bytesReceived - previousStats.bytesReceived) * 8) / (interval / 1000),
                packetsReceived: report.packetsReceived - previousStats.packetsReceived,
                packetsLost: report.packetsLost - previousStats.packetsLost,
                framesDropped: report.framesDropped - previousStats.framesDropped,
                framesDecoded: report.framesDecoded - previousStats.framesDecoded,
                jitter: report.jitter,
                jitterBufferDelay: report.jitterBufferDelay - previousStats.jitterBufferDelay,
                jitterBufferEmittedCount: report.jitterBufferEmittedCount - previousStats.jitterBufferEmittedCount,
                avgJitterDelayInInterval:
                    (report.jitterBufferDelay - previousStats.jitterBufferDelay) /
                    (report.jitterBufferEmittedCount - previousStats.jitterBufferEmittedCount),
                framesPerSecond: report.framesPerSecond,
                freezeCount: report.freezeCount - previousStats.freezeCount,
                freezeDuration: report.freezeDuration - previousStats.freezeDuration,
            };
        }

        return {
            timestamp: report.timestamp,
            duration: (interval * index) / 1000,
            rtt: report.rtt,
            bytesReceived: report.bytesReceived - stats[index - 1].bytesReceived,
            bitrate: ((report.bytesReceived - stats[index - 1].bytesReceived) * 8) / (interval / 1000),
            packetsReceived: report.packetsReceived - stats[index - 1].packetsReceived,
            packetsLost: report.packetsLost - stats[index - 1].packetsLost,
            framesDropped: report.framesDropped - stats[index - 1].framesDropped,
            framesDecoded: report.framesDecoded - stats[index - 1].framesDecoded,
            jitter: report.jitter,
            jitterBufferDelay: report.jitterBufferDelay - stats[index - 1].jitterBufferDelay,
            jitterBufferEmittedCount: report.jitterBufferEmittedCount - stats[index - 1].jitterBufferEmittedCount,
            avgJitterDelayInInterval:
                (report.jitterBufferDelay - stats[index - 1].jitterBufferDelay) /
                (report.jitterBufferEmittedCount - stats[index - 1].jitterBufferEmittedCount),
            framesPerSecond: report.framesPerSecond,
            freezeCount: report.freezeCount - stats[index - 1].freezeCount,
            freezeDuration: report.freezeDuration - stats[index - 1].freezeDuration,
        };
    });

    const anomalies = extractAnomalies(differentialReport);
    const lowFpsCount = anomalies.reduce((acc, report) => acc + (report.causes!.includes('low fps') ? 1 : 0), 0);

    const avgJittersSamples = differentialReport
        .filter(stat => !!stat.avgJitterDelayInInterval)
        .map(stat => stat.avgJitterDelayInInterval);

    const avgRttSamples = differentialReport.filter(stat => !!stat.rtt).map(stat => stat.rtt);

    return {
        webRTCStats: {
            anomalies: anomalies,
            minRtt: Math.min(...avgRttSamples),
            avgRtt: average(avgRttSamples),
            maxRtt: Math.max(...avgRttSamples),
            aggregateReport: createAggregateReport(stats[0], stats[stats.length - 1], lowFpsCount),
            minJitterDelayInInterval: Math.min(...avgJittersSamples),
            maxJitterDelayInInterval: Math.max(...avgJittersSamples),
            avgJitterDelayInInterval: average(avgJittersSamples),
        },
        codec: stats[0].codec,
        resolution: `${stats[0].frameWidth}x${stats[0].frameHeight}`,
    };
}
