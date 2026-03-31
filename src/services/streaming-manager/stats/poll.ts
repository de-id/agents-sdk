import { ConnectivityState, SlimRTCStatsReport, StreamingState } from '@sdk/types';
import { VideoRTCStatsReport, createVideoStatsReport, formatStats } from './report';

function findInboundRtpReport(stats: RTCStatsReport, kind: 'audio' | 'video'): any | null {
    for (const report of stats.values()) {
        if (report?.type === 'inbound-rtp' && (report as any).kind === kind) {
            return report;
        }
    }
    return null;
}

const AUDIO_STATS_POLL_INTERVAL_MS = 10;

export interface AudioArmContext {
    sttLatency?: number;
    serviceLatency?: number;
}

export function createAudioStatsDetector(
    getStats: () => Promise<RTCStatsReport | undefined>,
    onFirstAudioDetected: (context: AudioArmContext) => void
) {
    let armed = false;
    let baselined = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let armTime = 0;
    let prevTotalAudioEnergy = 0;
    let prevTotalSamplesReceived = 0;
    let armContext: AudioArmContext = {};

    async function poll() {
        if (!armed) return;

        try {
            const stats = await getStats();
            if (!stats) {
                timerId = setTimeout(poll, AUDIO_STATS_POLL_INTERVAL_MS);
                return;
            }

            const report = findInboundRtpReport(stats, 'audio');
            if (!report) {
                timerId = setTimeout(poll, AUDIO_STATS_POLL_INTERVAL_MS);
                return;
            }

            const totalAudioEnergy: number = report.totalAudioEnergy ?? 0;
            const totalSamplesReceived: number = report.totalSamplesReceived ?? 0;

            if (!baselined) {
                prevTotalAudioEnergy = totalAudioEnergy;
                prevTotalSamplesReceived = totalSamplesReceived;
                baselined = true;
                timerId = setTimeout(poll, AUDIO_STATS_POLL_INTERVAL_MS);
                return;
            }

            const energyDelta = totalAudioEnergy - prevTotalAudioEnergy;
            const samplesDelta = totalSamplesReceived - prevTotalSamplesReceived;
            prevTotalAudioEnergy = totalAudioEnergy;
            prevTotalSamplesReceived = totalSamplesReceived;

            if (samplesDelta > 0 && energyDelta > 0) {
                armed = false;
                onFirstAudioDetected(armContext);
                return;
            }
        } catch {
            // stats not available yet
        }

        if (armed) {
            timerId = setTimeout(poll, AUDIO_STATS_POLL_INTERVAL_MS);
        }
    }

    return {
        arm(context: AudioArmContext = {}) {
            armContext = context;
            armed = true;
            baselined = false;
            armTime = performance.now();
            if (timerId !== null) clearTimeout(timerId);
            timerId = setTimeout(poll, AUDIO_STATS_POLL_INTERVAL_MS);
        },
        destroy() {
            armed = false;
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
        },
    };
}

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
        const report = findInboundRtpReport(stats, 'video');
        if (!report) {
            return { isReceiving: false, avgJitterDelayInInterval };
        }

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
