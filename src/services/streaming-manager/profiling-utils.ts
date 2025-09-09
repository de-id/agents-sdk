/**
 * Profiling utilities for comparing streaming manager performance
 */

export interface ProfilingTimestamps {
    init: number;
    [key: string]: number;
}

export interface ProfilingResults {
    [key: string]: number;
}

export function calculateProfilingResults(timestamps: ProfilingTimestamps): ProfilingResults {
    const initTime = timestamps.init;
    const results: ProfilingResults = {};

    for (const [key, timestamp] of Object.entries(timestamps)) {
        if (key !== 'init' && timestamp > 0) {
            results[key] = timestamp - initTime;
        }
    }

    return results;
}

export function compareProfilingResults(
    webrtcResults: ProfilingResults,
    livekitResults: ProfilingResults,
    managerName: string = 'Streaming Manager'
): void {
    console.group(`📊 ${managerName} Performance Comparison`);

    // Find common phases
    const commonPhases = new Set([...Object.keys(webrtcResults), ...Object.keys(livekitResults)]);

    const comparisonTable: Record<string, { WebRTC: string; LiveKit: string; Difference: string; Winner: string }> = {};

    for (const phase of commonPhases) {
        const webrtcTime = webrtcResults[phase] || 0;
        const livekitTime = livekitResults[phase] || 0;
        const difference = Math.abs(webrtcTime - livekitTime);
        const winner = webrtcTime < livekitTime ? 'WebRTC' : 'LiveKit';

        comparisonTable[phase] = {
            WebRTC: `${webrtcTime.toFixed(2)}ms`,
            LiveKit: `${livekitTime.toFixed(2)}ms`,
            Difference: `${difference.toFixed(2)}ms`,
            Winner: winner,
        };
    }

    console.table(comparisonTable);

    // Overall performance summary
    const webrtcTotal = Math.max(...Object.values(webrtcResults));
    const livekitTotal = Math.max(...Object.values(livekitResults));
    const totalDifference = Math.abs(webrtcTotal - livekitTotal);
    const overallWinner = webrtcTotal < livekitTotal ? 'WebRTC' : 'LiveKit';

    console.log(`\n🏆 Overall Performance:`);
    console.log(`WebRTC Total: ${webrtcTotal.toFixed(2)}ms`);
    console.log(`LiveKit Total: ${livekitTotal.toFixed(2)}ms`);
    console.log(`Difference: ${totalDifference.toFixed(2)}ms`);
    console.log(`Winner: ${overallWinner}`);

    if (totalDifference > 100) {
        console.log(`⚠️  Significant performance difference detected!`);
    } else if (totalDifference > 50) {
        console.log(`⚡ Noticeable performance difference`);
    } else {
        console.log(`✅ Performance is comparable`);
    }

    console.groupEnd();
}

export function logDetailedProfiling(
    managerType: string,
    timestamps: ProfilingTimestamps,
    phaseDescriptions?: Record<string, string>
): void {
    const results = calculateProfilingResults(timestamps);

    console.group(`🔍 ${managerType} Detailed Profiling`);

    // Phase-by-phase breakdown
    const phases = Object.entries(results).sort(([, a], [, b]) => a - b);

    phases.forEach(([phase, time], index) => {
        const description = phaseDescriptions?.[phase] || '';
        const prevTime = index > 0 ? phases[index - 1][1] : 0;
        const phaseDuration = time - prevTime;

        console.log(`${phase}: ${time.toFixed(2)}ms ${description ? `(${description})` : ''}`);
        if (index > 0) {
            console.log(`  └─ Phase duration: ${phaseDuration.toFixed(2)}ms`);
        }
    });

    console.log(`\n📈 Total time to video render: ${Math.max(...Object.values(results)).toFixed(2)}ms`);
    console.groupEnd();
}

// Default phase descriptions for better understanding
export const WEBRTC_PHASE_DESCRIPTIONS = {
    'Stream Creation': 'API call to create stream on server',
    'PeerConnection Creation': 'Creating WebRTC peer connection object',
    'Offer Set': 'Setting remote description (server offer)',
    'Answer Created': 'Creating SDP answer',
    'Answer Set': 'Setting local description (client answer)',
    'Connection Started': 'Sending answer to server',
    'First Track Received': 'First media track received from server',
    'Video Rendered': 'Video element shows content',
};

export const LIVEKIT_PHASE_DESCRIPTIONS = {
    'Stream API Created': 'Creating LiveKit stream API client',
    'Room Created': 'Creating LiveKit room instance',
    'Stream Created': 'API call to create stream on server',
    'Room Connected': 'Connecting to LiveKit room',
    'First Track Received': 'First media track received from server',
    'Video Rendered': 'Video element shows content',
};
