/**
 * Example usage of streaming manager profiling
 *
 * This file demonstrates how to use the profiling utilities to compare
 * WebRTC and LiveKit streaming manager performance.
 */

import { enableProfilingComparison, resetProfiling } from './profiling-comparison';

/**
 * Enable profiling comparison mode
 * Call this before creating any streaming managers to enable side-by-side comparison
 */
export function enableStreamingProfiling(): void {
    enableProfilingComparison();
    console.log('🚀 Streaming manager profiling enabled!');
    console.log('   - Individual manager performance will be logged');
    console.log('   - Side-by-side comparison will be shown when both managers complete');
}

/**
 * Reset profiling data
 * Call this to clear all profiling data and start fresh
 */
export function resetStreamingProfiling(): void {
    resetProfiling();
    console.log('🔄 Streaming manager profiling reset');
}

/**
 * Example usage in your application:
 *
 * ```typescript
 * import { enableStreamingProfiling } from './profiling-example';
 *
 * // Enable profiling before creating managers
 * enableStreamingProfiling();
 *
 * // Create your streaming managers as usual
 * const webrtcManager = await createStreamingManager(agentId, agent, options);
 * const livekitManager = await createLiveKitStreamingManager(agentId, agent, options);
 *
 * // Profiling results will be automatically logged to console
 * ```
 */

// Auto-enable profiling in development mode
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    enableStreamingProfiling();
}
