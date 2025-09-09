/**
 * Profiling comparison utility for streaming managers
 * This utility can be used to compare performance between WebRTC and LiveKit managers
 */

import { ProfilingTimestamps, calculateProfilingResults, compareProfilingResults } from './profiling-utils';

export class StreamingManagerProfiler {
    private webrtcTimestamps: ProfilingTimestamps | null = null;
    private livekitTimestamps: ProfilingTimestamps | null = null;
    private comparisonEnabled = false;

    /**
     * Enable comparison mode - this will store timestamps for both managers
     * and allow side-by-side comparison
     */
    enableComparison(): void {
        this.comparisonEnabled = true;
        console.log('🔬 Streaming Manager Profiling Comparison enabled');
    }

    /**
     * Record timestamps for WebRTC manager
     */
    recordWebRTC(timestamps: ProfilingTimestamps): void {
        this.webrtcTimestamps = timestamps;
        console.log('📊 WebRTC timestamps recorded');

        if (this.comparisonEnabled && this.livekitTimestamps) {
            this.performComparison();
        }
    }

    /**
     * Record timestamps for LiveKit manager
     */
    recordLiveKit(timestamps: ProfilingTimestamps): void {
        this.livekitTimestamps = timestamps;
        console.log('📊 LiveKit timestamps recorded');

        if (this.comparisonEnabled && this.webrtcTimestamps) {
            this.performComparison();
        }
    }

    /**
     * Perform side-by-side comparison of both managers
     */
    private performComparison(): void {
        if (!this.webrtcTimestamps || !this.livekitTimestamps) {
            console.warn('⚠️ Cannot perform comparison - missing timestamps for one or both managers');
            return;
        }

        const webrtcResults = calculateProfilingResults(this.webrtcTimestamps);
        const livekitResults = calculateProfilingResults(this.livekitTimestamps);

        compareProfilingResults(webrtcResults, livekitResults, 'Streaming Manager Performance');

        // Reset for next comparison
        this.webrtcTimestamps = null;
        this.livekitTimestamps = null;
    }

    /**
     * Get current profiling data
     */
    getProfilingData(): {
        webrtc: ProfilingTimestamps | null;
        livekit: ProfilingTimestamps | null;
        comparisonEnabled: boolean;
    } {
        return {
            webrtc: this.webrtcTimestamps,
            livekit: this.livekitTimestamps,
            comparisonEnabled: this.comparisonEnabled,
        };
    }

    /**
     * Reset all profiling data
     */
    reset(): void {
        this.webrtcTimestamps = null;
        this.livekitTimestamps = null;
        this.comparisonEnabled = false;
        console.log('🔄 Profiling data reset');
    }
}

// Global profiler instance
export const globalProfiler = new StreamingManagerProfiler();

// Convenience functions for easy usage
export function enableProfilingComparison(): void {
    globalProfiler.enableComparison();
}

export function recordWebRTCProfiling(timestamps: ProfilingTimestamps): void {
    globalProfiler.recordWebRTC(timestamps);
}

export function recordLiveKitProfiling(timestamps: ProfilingTimestamps): void {
    globalProfiler.recordLiveKit(timestamps);
}

export function resetProfiling(): void {
    globalProfiler.reset();
}
