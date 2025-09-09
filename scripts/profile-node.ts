#!/usr/bin/env tsx

/**
 * Node.js Streaming Manager Profiling Script
 *
 * This script runs both WebRTC and LiveKit streaming managers
 * and compares their performance from initialization to video render.
 *
 * Usage:
 *   npx tsx scripts/profile-node.ts
 *
 * Environment Variables Required:
 *   VITE_AGENT_ID - The agent ID to test with
 *   VITE_CLIENT_KEY - The client key for authentication
 *   VITE_DID_API_URL - The D-ID API URL
 *   VITE_WS_ENDPOINT - The WebSocket endpoint URL
 */

import { createAgentManager } from '../src/services/agent-manager';
import { enableStreamingProfiling } from '../src/services/streaming-manager';
import { Auth, ChatMode, ConnectionState } from '../src/types';

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
    console.error('\nExample:');
    console.error(
        '  VITE_AGENT_ID=your_agent_id VITE_CLIENT_KEY=your_key VITE_DID_API_URL=https://api.d-id.com VITE_WS_ENDPOINT=wss://api.d-id.com npx tsx scripts/profile-node.ts'
    );
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
const createCallbacks = (managerType: string) => ({
    onConnectionStateChange: (state: ConnectionState) => {
        console.log(`[${managerType}] Connection state: ${state}`);
    },
    onVideoStateChange: (state: any) => {
        console.log(`[${managerType}] Video state: ${state}`);
    },
    onAgentActivityStateChange: (state: any) => {
        console.log(`[${managerType}] Agent activity: ${state}`);
    },
    onSrcObjectReady: (stream: MediaStream) => {
        console.log(`[${managerType}] Video stream ready`);
    },
    onNewMessage: (messages: any[]) => {
        console.log(`[${managerType}] New messages:`, messages.length);
    },
    onConnectivityStateChange: (state: any) => {
        console.log(`[${managerType}] Connectivity: ${state}`);
    },
    onError: (error: Error, context?: any) => {
        console.error(`[${managerType}] Error:`, error.message, context);
    },
});

// Test WebRTC Manager (Legacy)
async function testWebRTCManager(): Promise<void> {
    console.log('🔧 Testing WebRTC Manager (Legacy)...');

    try {
        const manager = await createAgentManager(agentId, {
            callbacks: createCallbacks('WebRTC'),
            baseURL: didApiUrl,
            wsURL: wsUrl,
            mode: ChatMode.Functional,
            auth: { type: 'key', clientKey } as Auth,
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
        console.error('❌ WebRTC Manager failed:', (error as Error).message);
        throw error;
    }
}

// Test LiveKit Manager (Fluent)
async function testLiveKitManager(): Promise<void> {
    console.log('🔧 Testing LiveKit Manager (Fluent)...');

    try {
        const manager = await createAgentManager(agentId, {
            callbacks: createCallbacks('LiveKit'),
            baseURL: didApiUrl,
            wsURL: wsUrl,
            mode: ChatMode.Functional,
            auth: { type: 'key', clientKey } as Auth,
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
        console.error('❌ LiveKit Manager failed:', (error as Error).message);
        throw error;
    }
}

// Run the profiling tests
async function runProfiling(): Promise<void> {
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
        console.error('\n💥 Profiling failed:', (error as Error).message);
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
