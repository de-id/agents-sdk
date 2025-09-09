#!/usr/bin/env node

/**
 * Streaming Manager Profiling Script
 *
 * This script runs both WebRTC and LiveKit streaming managers
 * and compares their performance from initialization to video render.
 *
 * Usage:
 *   node scripts/profile-streaming.js
 *
 * Environment Variables Required:
 *   VITE_AGENT_ID - The agent ID to test with
 *   VITE_CLIENT_KEY - The client key for authentication
 *   VITE_DID_API_URL - The D-ID API URL
 *   VITE_WS_ENDPOINT - The WebSocket endpoint URL
 */

import { createAgentManager, enableStreamingProfiling } from '../dist/index.js';

// Load environment variables
const agentId = process.env.VITE_AGENT_ID;
const clientKey = process.env.VITE_CLIENT_KEY;
const didApiUrl = process.env.VITE_DID_API_URL;
const wsUrl = process.env.VITE_WS_ENDPOINT;

if (!agentId || !clientKey || !didApiUrl || !wsUrl) {
    console.error('❌ Missing required environment variables:');
    console.error('   VITE_AGENT_ID:', agentId ? '✅' : '❌');
    console.error('   VITE_CLIENT_KEY:', clientKey ? '✅' : '❌');
    console.error('   VITE_DID_API_URL:', didApiUrl ? '✅' : '❌');
    console.error('   VITE_WS_ENDPOINT:', wsUrl ? '✅' : '❌');
    console.error('\nPlease set these environment variables and try again.');
    process.exit(1);
}

console.log('🚀 Starting Streaming Manager Profiling...');
console.log(`📋 Agent ID: ${agentId}`);
console.log(`🌐 API URL: ${didApiUrl}`);
console.log(`🔌 WebSocket URL: ${wsUrl}`);
console.log('');

// Enable profiling comparison
enableStreamingProfiling();

// Test configuration
const testText = 'Hello, this is a test message for profiling the streaming managers.';
const testTimeout = 30000; // 30 seconds timeout

// Common callbacks for both managers
const createCallbacks = (managerType) => ({
    onConnectionStateChange: (state) => {
        console.log(`[${managerType}] Connection state: ${state}`);
    },
    onVideoStateChange: (state) => {
        console.log(`[${managerType}] Video state: ${state}`);
    },
    onAgentActivityStateChange: (state) => {
        console.log(`[${managerType}] Agent activity: ${state}`);
    },
    onSrcObjectReady: (stream) => {
        console.log(`[${managerType}] Video stream ready`);
    },
    onNewMessage: (messages) => {
        console.log(`[${managerType}] New messages:`, messages.length);
    },
    onConnectivityStateChange: (state) => {
        console.log(`[${managerType}] Connectivity: ${state}`);
    },
    onError: (error, context) => {
        console.error(`[${managerType}] Error:`, error.message, context);
    },
});

// Test WebRTC Manager (Legacy)
async function testWebRTCManager() {
    console.log('🔧 Testing WebRTC Manager (Legacy)...');

    try {
        const manager = await createAgentManager(agentId, {
            callbacks: createCallbacks('WebRTC'),
            baseURL: didApiUrl,
            wsURL: wsUrl,
            mode: 'functional',
            auth: { type: 'key', clientKey },
            streamOptions: {
                streamWarmup: false,
                fluent: false, // Force legacy mode
            },
        });

        await manager.connect();
        console.log('✅ WebRTC Manager connected');

        // Wait a bit for video to render
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test speaking
        await manager.speak({ type: 'text', input: testText });
        console.log('✅ WebRTC Manager spoke test message');

        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 5000));

        await manager.disconnect();
        console.log('✅ WebRTC Manager disconnected');

    } catch (error) {
        console.error('❌ WebRTC Manager failed:', error.message);
        throw error;
    }
}

// Test LiveKit Manager (Fluent)
async function testLiveKitManager() {
    console.log('🔧 Testing LiveKit Manager (Fluent)...');

    try {
        const manager = await createAgentManager(agentId, {
            callbacks: createCallbacks('LiveKit'),
            baseURL: didApiUrl,
            wsURL: wsUrl,
            mode: 'functional',
            auth: { type: 'key', clientKey },
            streamOptions: {
                streamWarmup: false,
                fluent: true, // Force fluent mode
            },
        });

        await manager.connect();
        console.log('✅ LiveKit Manager connected');

        // Wait a bit for video to render
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test speaking
        await manager.speak({ type: 'text', input: testText });
        console.log('✅ LiveKit Manager spoke test message');

        // Wait for completion
        await new Promise(resolve => setTimeout(resolve, 5000));

        await manager.disconnect();
        console.log('✅ LiveKit Manager disconnected');

    } catch (error) {
        console.error('❌ LiveKit Manager failed:', error.message);
        throw error;
    }
}

// Run the profiling tests
async function runProfiling() {
    const startTime = Date.now();

    try {
        console.log('📊 Starting profiling tests...\n');

        // Test WebRTC first
        await testWebRTCManager();

        console.log('\n' + '='.repeat(50) + '\n');

        // Test LiveKit second
        await testLiveKitManager();

        const totalTime = Date.now() - startTime;
        console.log(`\n🎉 Profiling completed in ${totalTime}ms`);
        console.log('📈 Check the console output above for detailed performance comparisons.');

    } catch (error) {
        console.error('\n💥 Profiling failed:', error.message);
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n⏹️  Profiling interrupted by user');
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the profiling
runProfiling();
