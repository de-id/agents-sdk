#!/usr/bin/env tsx

/**
 * Standalone Streaming Manager Profiling Script
 *
 * This script demonstrates the profiling functionality by simulating
 * the timing measurements that would occur in a real streaming scenario.
 *
 * Usage:
 *   npx tsx scripts/profile-standalone.ts
 */

// Simulate the profiling functionality
interface ProfilingTimestamps {
    init: number;
    [key: string]: number;
}

interface ProfilingResults {
    [key: string]: number;
}

function calculateProfilingResults(timestamps: ProfilingTimestamps): ProfilingResults {
    const initTime = timestamps.init;
    const results: ProfilingResults = {};

    for (const [key, timestamp] of Object.entries(timestamps)) {
        if (key !== 'init' && timestamp > 0) {
            results[key] = timestamp - initTime;
        }
    }

    return results;
}

function logDetailedProfiling(
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

function compareProfilingResults(
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

// Simulate WebRTC Manager profiling
function simulateWebRTCProfiling(): ProfilingTimestamps {
    console.log('🔧 Simulating WebRTC Manager (Legacy)...');

    const timestamps: ProfilingTimestamps = {
        init: performance.now(),
    };

    // Simulate realistic timing for WebRTC phases
    const delays = {
        streamCreated: 45,
        peerConnectionCreated: 2,
        offerSet: 15,
        answerCreated: 8,
        answerSet: 5,
        connectionStarted: 12,
        firstTrackReceived: 1200, // This is usually the longest phase
        videoRendered: 50,
    };

    // Simulate each phase with realistic delays
    let currentTime = timestamps.init;
    for (const [phase, delay] of Object.entries(delays)) {
        currentTime += delay + Math.random() * 20; // Add some randomness
        timestamps[phase] = currentTime;
    }

    return timestamps;
}

// Simulate LiveKit Manager profiling
function simulateLiveKitProfiling(): ProfilingTimestamps {
    console.log('🔧 Simulating LiveKit Manager (Fluent)...');

    const timestamps: ProfilingTimestamps = {
        init: performance.now(),
    };

    // Simulate realistic timing for LiveKit phases
    const delays = {
        streamApiCreated: 5,
        roomCreated: 8,
        streamCreated: 35,
        roomConnected: 150,
        firstTrackReceived: 800, // Usually faster than WebRTC
        videoRendered: 30,
    };

    // Simulate each phase with realistic delays
    let currentTime = timestamps.init;
    for (const [phase, delay] of Object.entries(delays)) {
        currentTime += delay + Math.random() * 15; // Add some randomness
        timestamps[phase] = currentTime;
    }

    return timestamps;
}

// Phase descriptions
const WEBRTC_PHASE_DESCRIPTIONS = {
    'Stream Creation': 'API call to create stream on server',
    'PeerConnection Creation': 'Creating WebRTC peer connection object',
    'Offer Set': 'Setting remote description (server offer)',
    'Answer Created': 'Creating SDP answer',
    'Answer Set': 'Setting local description (client answer)',
    'Connection Started': 'Sending answer to server',
    'First Track Received': 'First media track received from server',
    'Video Rendered': 'Video element shows content',
};

const LIVEKIT_PHASE_DESCRIPTIONS = {
    'Stream API Created': 'Creating LiveKit stream API client',
    'Room Created': 'Creating LiveKit room instance',
    'Stream Created': 'API call to create stream on server',
    'Room Connected': 'Connecting to LiveKit room',
    'First Track Received': 'First media track received from server',
    'Video Rendered': 'Video element shows content',
};

// Main profiling function
async function runProfiling(): Promise<void> {
    console.log('🚀 Starting Streaming Manager Profiling Simulation...');
    console.log('📋 This simulation demonstrates the profiling functionality');
    console.log('📋 with realistic timing data for both WebRTC and LiveKit managers\n');

    // Simulate WebRTC profiling
    const webrtcTimestamps = simulateWebRTCProfiling();
    logDetailedProfiling('WebRTC', webrtcTimestamps, WEBRTC_PHASE_DESCRIPTIONS);

    console.log('\n' + '='.repeat(50) + '\n');

    // Simulate LiveKit profiling
    const livekitTimestamps = simulateLiveKitProfiling();
    logDetailedProfiling('LiveKit', livekitTimestamps, LIVEKIT_PHASE_DESCRIPTIONS);

    console.log('\n' + '='.repeat(50) + '\n');

    // Compare results
    const webrtcResults = calculateProfilingResults(webrtcTimestamps);
    const livekitResults = calculateProfilingResults(livekitTimestamps);
    compareProfilingResults(webrtcResults, livekitResults, 'Streaming Manager Performance');

    console.log('\n🎉 Profiling simulation completed!');
    console.log('📈 This demonstrates how the real profiling system would work');
    console.log('📈 when integrated with actual streaming managers.');
}

// Run the profiling
runProfiling().catch(error => {
    console.error('💥 Profiling simulation failed:', error);
    process.exit(1);
});
