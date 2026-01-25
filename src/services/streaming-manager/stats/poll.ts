import { ConnectivityState, SlimRTCStatsReport, StreamingState } from '@sdk/types';
import { VideoRTCStatsReport, createVideoStatsReport, formatStats } from './report';

const interval = 100;
const notReceivingIntervalsThreshold = Math.max(Math.ceil(400 / interval), 1);
const LOW_JITTER_TRESHOLD = 0.25;
const HIGH_JITTER_TRESHOLD = 0.28;

function createVideoStatsAnalyzer() {
    let lastFramesReceived = 0;
    let prevDelay: any;
    let prevCount: any;
    let avgJitterDelayInInterval = 0;
    return (stats: RTCStatsReport) => {
        for (const report of stats.values()) {
            if (report && report.type === 'inbound-rtp' && report.kind === 'video') {
                const delay = report.jitterBufferDelay;
                const count = report.jitterBufferEmittedCount;

                if (prevCount && count > prevCount) {
                    const deltaDelay = delay - prevDelay;
                    const deltaCount = count - prevCount;
                    avgJitterDelayInInterval = deltaDelay / deltaCount;
                }

                prevDelay = delay;
                prevCount = count;

                const currFramesReceived = report.framesDecoded;
                const isReceiving = currFramesReceived - lastFramesReceived > 0;
                lastFramesReceived = currFramesReceived;

                return { isReceiving, avgJitterDelayInInterval, freezeCount: report.freezeCount };
            }
        }

        return { isReceiving: false, avgJitterDelayInInterval };
    };
}

export function createVideoStatsMonitor(
    getStats: () => Promise<RTCStatsReport | undefined>,
    getIsConnected: () => boolean,
    onConnected: () => void,
    onVideoStateChange?: (state: StreamingState, statsReport?: VideoRTCStatsReport) => void,
    onConnectivityStateChange?: (state: ConnectivityState) => void
) {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    let allStats: SlimRTCStatsReport[] = [];
    let previousStats: SlimRTCStatsReport;
    let notReceivingNumIntervals = 0;
    let isStreaming = false;
    let streamsCount = 0;
    let prevLowConnState = ConnectivityState.Unknown;
    let currLowConnState = ConnectivityState.Unknown;
    let currFreezeCount = 0;
    let prevFreezeCount = 0;

    const isReceivingVideoBytes = createVideoStatsAnalyzer();

    async function getAndAnalyzeVideoStats() {
        const stats = await getStats();
        if (!stats) {
            return;
        }

        const { isReceiving, avgJitterDelayInInterval, freezeCount } = isReceivingVideoBytes(stats);
        const slimStats = formatStats(stats);

        if (isReceiving) {
            notReceivingNumIntervals = 0;
            currFreezeCount = freezeCount - prevFreezeCount;
            currLowConnState =
                avgJitterDelayInInterval < LOW_JITTER_TRESHOLD
                    ? ConnectivityState.Strong
                    : avgJitterDelayInInterval > HIGH_JITTER_TRESHOLD && currFreezeCount > 1
                      ? ConnectivityState.Weak
                      : prevLowConnState;

            if (currLowConnState !== prevLowConnState) {
                onConnectivityStateChange?.(currLowConnState);
                prevLowConnState = currLowConnState;
                prevFreezeCount += currFreezeCount;
                currFreezeCount = 0;
            }

            if (!isStreaming) {
                onVideoStateChange?.(StreamingState.Start);

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

                if (!getIsConnected()) {
                    onConnected();
                }

                prevFreezeCount = freezeCount;
                isStreaming = false;
            }
        }
    }

    return {
        start: () => {
            if (intervalId) return;

            intervalId = setInterval(getAndAnalyzeVideoStats, interval);
        },
        stop: () => {
            if (!intervalId) return;

            clearInterval(intervalId);
            intervalId = null;
        },
        getReport: (): VideoRTCStatsReport => {
            return createVideoStatsReport(allStats, interval, previousStats);
        },
    };
}
