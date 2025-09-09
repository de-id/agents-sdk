#!/usr/bin/env tsx

/**
 * Real Streaming Manager Profiling Script
 *
 * This script demonstrates the profiling functionality with actual timing
 * measurements, simulating the real streaming manager behavior.
 *
 * Usage:
 *   npx tsx scripts/profile-real.ts
 */

// Profiling utilities (copied from the actual implementation)
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

// Simulate realistic WebRTC Manager with actual timing
async function simulateWebRTCManager(): Promise<ProfilingTimestamps> {
    console.log('🔧 Simulating WebRTC Manager (Legacy)...');

    const timestamps: ProfilingTimestamps = {
        init: performance.now(),
    };

    // Simulate stream creation (API call)
    console.log('  📡 Creating stream...');
    await new Promise(resolve => setTimeout(resolve, 40 + Math.random() * 20));
    timestamps.streamCreated = performance.now();

    // Simulate peer connection creation
    console.log('  🔗 Creating peer connection...');
    await new Promise(resolve => setTimeout(resolve, 2 + Math.random() * 5));
    timestamps.peerConnectionCreated = performance.now();

    // Simulate offer setting
    console.log('  📋 Setting remote description...');
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 10));
    timestamps.offerSet = performance.now();

    // Simulate answer creation
    console.log('  💬 Creating answer...');
    await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 5));
    timestamps.answerCreated = performance.now();

    // Simulate answer setting
    console.log('  📝 Setting local description...');
    await new Promise(resolve => setTimeout(resolve, 3 + Math.random() * 3));
    timestamps.answerSet = performance.now();

    // Simulate connection start
    console.log('  🚀 Starting connection...');
    await new Promise(resolve => setTimeout(resolve, 8 + Math.random() * 5));
    timestamps.connectionStarted = performance.now();

    // Simulate first track received (this is usually the longest wait)
    console.log('  🎥 Waiting for first track...');
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
    timestamps.firstTrackReceived = performance.now();

    // Simulate video rendered
    console.log('  🖼️  Video rendered...');
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 20));
    timestamps.videoRendered = performance.now();

    return timestamps;
}

// Simulate realistic LiveKit Manager with actual timing
async function simulateLiveKitManager(): Promise<ProfilingTimestamps> {
    console.log('🔧 Simulating LiveKit Manager (Fluent)...');

    const timestamps: ProfilingTimestamps = {
        init: performance.now(),
    };

    // Simulate stream API creation
    console.log('  🔧 Creating stream API...');
    await new Promise(resolve => setTimeout(resolve, 3 + Math.random() * 5));
    timestamps.streamApiCreated = performance.now();

    // Simulate room creation
    console.log('  🏠 Creating room...');
    await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 5));
    timestamps.roomCreated = performance.now();

    // Simulate stream creation
    console.log('  📡 Creating stream...');
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 15));
    timestamps.streamCreated = performance.now();

    // Simulate room connection
    console.log('  🔌 Connecting to room...');
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 50));
    timestamps.roomConnected = performance.now();

    // Simulate first track received (usually faster than WebRTC)
    console.log('  🎥 Waiting for first track...');
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 200));
    timestamps.firstTrackReceived = performance.now();

    // Simulate video rendered
    console.log('  🖼️  Video rendered...');
    await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 15));
    timestamps.videoRendered = performance.now();

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
    console.log('🚀 Starting Real Streaming Manager Profiling...');
    console.log('📋 This uses actual timing measurements to simulate real behavior\n');

    // Simulate WebRTC profiling
    const webrtcTimestamps = await simulateWebRTCManager();
    logDetailedProfiling('WebRTC', webrtcTimestamps, WEBRTC_PHASE_DESCRIPTIONS);

    console.log('\n' + '='.repeat(50) + '\n');

    // Simulate LiveKit profiling
    const livekitTimestamps = await simulateLiveKitManager();
    logDetailedProfiling('LiveKit', livekitTimestamps, LIVEKIT_PHASE_DESCRIPTIONS);

    console.log('\n' + '='.repeat(50) + '\n');

    // Compare results
    const webrtcResults = calculateProfilingResults(webrtcTimestamps);
    const livekitResults = calculateProfilingResults(livekitTimestamps);
    compareProfilingResults(webrtcResults, livekitResults, 'Streaming Manager Performance');

    console.log('\n🎉 Real profiling simulation completed!');
    console.log('📈 This demonstrates the actual profiling system with real timing');
    console.log('📈 measurements that would occur in production streaming managers.');
}

// Run the profiling
runProfiling().catch(error => {
    console.error('💥 Profiling simulation failed:', error);
    process.exit(1);
});
