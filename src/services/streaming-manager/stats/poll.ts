import { SlimRTCStatsReport, StreamingState } from '$/types';
import { VideoRTCStatsReport, createVideoStatsReport, formatStats } from './report';

const interval = 100;
const notReceivingIntervalsThreshold = Math.max(Math.ceil(1000 / interval), 1);

export function createVideoStatsAnalyzer() {
    let lastBytesReceived = 0;

    return (stats: RTCStatsReport) => {
        for (const report of stats.values()) {
            if (report && report.type === 'inbound-rtp' && report.kind === 'video') {
                const currBytesReceived = report.bytesReceived;
                const isReceiving = currBytesReceived - lastBytesReceived > 0;

                lastBytesReceived = currBytesReceived;

                return isReceiving;
            }
        }

        return false;
    };
}

export function pollStats(
    peerConnection: RTCPeerConnection,
    getIsConnected: () => boolean,
    onConnected: () => void,
    onVideoStateChange?: (state: StreamingState, statsReport?: VideoRTCStatsReport) => void,
    warmup: boolean = false,
) {
    const streamsBeforeReady = warmup ? 1 : 0;

    let allStats: SlimRTCStatsReport[] = [];
    let previousStats: SlimRTCStatsReport;
    let notReceivingNumIntervals = 0;
    let isStreaming = false;
    let streamsCount = 0;

    const isReceivingVideoBytes = createVideoStatsAnalyzer();

    return setInterval(async () => {
        const stats = await peerConnection.getStats();
        const isReceiving = isReceivingVideoBytes(stats);
        const slimStats = formatStats(stats);

        if (isReceiving) {
            notReceivingNumIntervals = 0;

            if (!isStreaming) {
                onVideoStateChange?.(StreamingState.Start);

                if (streamsCount >= streamsBeforeReady && !getIsConnected()) {
                    onConnected();
                }

                previousStats = allStats[allStats.length - 1];
                allStats = [];
                streamsCount++;
                isStreaming = true;
            }

            allStats.push(slimStats);
        } else if (isStreaming) {
            notReceivingNumIntervals++;

            if (notReceivingNumIntervals >= notReceivingIntervalsThreshold) {
                const statsReport = createVideoStatsReport(allStats, interval, previousStats);

                onVideoStateChange?.(StreamingState.Stop, statsReport);

                isStreaming = false;
            }
        }
    }, interval);
}
