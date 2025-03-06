import { SlimRTCStatsReport, AnalyticsRTCStatsReport } from '../types';

export interface VideoRTCStatsReport {
    webRTCStats: {
        anomalies: AnalyticsRTCStatsReport[];
        aggregateReport: AnalyticsRTCStatsReport;
    };
    codec: string;
    resolution: string;
}

function createAggregateReport(start: SlimRTCStatsReport, end: SlimRTCStatsReport, lowFpsCount: number): AnalyticsRTCStatsReport {
    const duration = (end.timestamp - start.timestamp) / 1000;
    return {
        duration,
        bytesReceived: end.bytesReceived - start.bytesReceived,
        bitrate: Math.round((end.bytesReceived - start.bytesReceived) * 8 / duration),
        packetsReceived: end.packetsReceived - start.packetsReceived,
        packetsLost: end.packetsLost - start.packetsLost,
        framesDropped: end.framesDropped - start.framesDropped,
        framesDecoded: end.framesDecoded - start.framesDecoded,
        jitter: end.jitter,
        jitterBufferDelay: (end.jitterBufferDelay - start.jitterBufferDelay) / duration,
        framesPerSecond: end.framesPerSecond,
        freezeCount: end.freezeCount - start.freezeCount,
        freezeDuration: end.freezeDuration - start.freezeDuration,
        lowFpsCount,
    };
}
function extractAnomalies(stats: AnalyticsRTCStatsReport[]): AnalyticsRTCStatsReport[] {
    return stats.filter(report =>
        report.freezeCount > 0 || report.framesPerSecond < 21 || report.framesDropped > 0 || report.packetsLost > 0)
        .map(report => {
            const {timestamp, ...updatedReport} = report;
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
    for (const report of stats.values()) {
        if(report && report.type === 'codec' && report.mimeType.startsWith('video')) {
            codec = report.mimeType.split('/')[1];
        }
        if (report && report.type === 'inbound-rtp' && report.kind === 'video') {
            return {
                codec,
                timestamp: report.timestamp,
                bytesReceived: report.bytesReceived,
                packetsReceived: report.packetsReceived,
                packetsLost: report.packetsLost,
                framesDropped: report.framesDropped,
                framesDecoded: report.framesDecoded,
                jitter: report.jitter,
                jitterBufferDelay: report.jitterBufferDelay,
                frameWidth: report.frameWidth,
                frameHeight: report.frameHeight,
                framesPerSecond: report.framesPerSecond,
                freezeCount: report.freezeCount,
                freezeDuration: report.totalFreezesDuration,
            } as SlimRTCStatsReport;
        }
    }
    return {} as SlimRTCStatsReport;
}

export function createVideoStatsReport(
    stats: SlimRTCStatsReport[],
    interval: number,
    previousStats?: SlimRTCStatsReport,
): VideoRTCStatsReport {
    const differentialReport = stats.map((report, index) => {
        if (index === 0) {
            if (!previousStats) {
                return {
                    timestamp: report.timestamp,
                    duration: 0,
                    bytesReceived: report.bytesReceived,
                    bitrate: report.bytesReceived * 8 / (interval / 1000),
                    packetsReceived: report.packetsReceived,
                    packetsLost: report.packetsLost,
                    framesDropped: report.framesDropped,
                    framesDecoded: report.framesDecoded,
                    jitter: report.jitter,
                    jitterBufferDelay: report.jitterBufferDelay,
                    framesPerSecond: report.framesPerSecond,
                    freezeCount: report.freezeCount,
                    freezeDuration: report.freezeDuration,
                };
            }

            return {
                timestamp: report.timestamp,
                duration: 0,
                bytesReceived: report.bytesReceived - previousStats.bytesReceived,
                bitrate: (report.bytesReceived - previousStats.bytesReceived) * 8 / (interval / 1000),
                packetsReceived: report.packetsReceived - previousStats.packetsReceived,
                packetsLost: report.packetsLost - previousStats.packetsLost,
                framesDropped: report.framesDropped - previousStats.framesDropped,
                framesDecoded: report.framesDecoded - previousStats.framesDecoded,
                jitter: report.jitter,
                jitterBufferDelay: report.jitterBufferDelay - previousStats.jitterBufferDelay,
                framesPerSecond: report.framesPerSecond,
                freezeCount: report.freezeCount - previousStats.freezeCount,
                freezeDuration: report.freezeDuration - previousStats.freezeDuration,
            };
        }

        return {
            timestamp: report.timestamp,
            duration: interval * index / 1000,
            bytesReceived: report.bytesReceived - stats[index - 1].bytesReceived,
            bitrate: (report.bytesReceived - stats[index - 1].bytesReceived) * 8 / (interval / 1000),
            packetsReceived: report.packetsReceived - stats[index - 1].packetsReceived,
            packetsLost: report.packetsLost - stats[index - 1].packetsLost,
            framesDropped: report.framesDropped - stats[index - 1].framesDropped,
            framesDecoded: report.framesDecoded - stats[index - 1].framesDecoded,
            jitter: report.jitter,
            jitterBufferDelay: report.jitterBufferDelay - stats[index - 1].jitterBufferDelay,
            framesPerSecond: report.framesPerSecond,
            freezeCount: report.freezeCount - stats[index - 1].freezeCount,
            freezeDuration: report.freezeDuration - stats[index - 1].freezeDuration,
        };
    })
    const anomalies = extractAnomalies(differentialReport);
    const lowFpsCount = anomalies.reduce((acc, report) => acc + (report.causes!.includes('low fps') ? 1 : 0), 0);
    return {
        webRTCStats:{
            anomalies: anomalies,
            aggregateReport: createAggregateReport(stats[0], stats[stats.length - 1], lowFpsCount),
        },
        codec: stats[0].codec,
        resolution: `${stats[0].frameWidth}x${stats[0].frameHeight}`,
    }
}
