# Streaming Manager Profiling

This document describes the profiling capabilities added to the streaming managers to measure and compare performance between WebRTC and LiveKit implementations.

## Overview

The profiling system measures the time from initialization until video gets rendered in the video element, providing detailed insights into each phase of the streaming process.

## Features

-   **Individual Manager Profiling**: Detailed timing for each phase of WebRTC and LiveKit managers
-   **Side-by-Side Comparison**: Automatic comparison when both managers are used
-   **Phase-by-Phase Analysis**: Breakdown of time spent in each step
-   **Console Logging**: Rich console output with tables and summaries
-   **Development Mode**: Auto-enabled in development environments

## Usage

### Basic Usage

```typescript
import { enableStreamingProfiling } from './streaming-manager';

// Enable profiling before creating managers
enableStreamingProfiling();

// Create your streaming managers as usual
const webrtcManager = await createStreamingManager(agentId, agent, options);
const livekitManager = await createLiveKitStreamingManager(agentId, agent, options);

// Profiling results will be automatically logged to console
```

### Advanced Usage

```typescript
import {
    globalProfiler,
    enableProfilingComparison,
    calculateProfilingResults,
    compareProfilingResults,
} from './streaming-manager';

// Enable comparison mode
enableProfilingComparison();

// Access profiling data programmatically
const data = globalProfiler.getProfilingData();
console.log('WebRTC data:', data.webrtc);
console.log('LiveKit data:', data.livekit);

// Manual comparison
if (data.webrtc && data.livekit) {
    const webrtcResults = calculateProfilingResults(data.webrtc);
    const livekitResults = calculateProfilingResults(data.livekit);
    compareProfilingResults(webrtcResults, livekitResults);
}
```

## Profiling Phases

### WebRTC Manager Phases

1. **Stream Creation**: API call to create stream on server
2. **PeerConnection Creation**: Creating WebRTC peer connection object
3. **Offer Set**: Setting remote description (server offer)
4. **Answer Created**: Creating SDP answer
5. **Answer Set**: Setting local description (client answer)
6. **Connection Started**: Sending answer to server
7. **First Track Received**: First media track received from server
8. **Video Rendered**: Video element shows content

### LiveKit Manager Phases

1. **Stream API Created**: Creating LiveKit stream API client
2. **Room Created**: Creating LiveKit room instance
3. **Stream Created**: API call to create stream on server
4. **Room Connected**: Connecting to LiveKit room
5. **First Track Received**: First media track received from server
6. **Video Rendered**: Video element shows content

## Console Output

The profiling system provides rich console output including:

-   **Individual Manager Logs**: Detailed phase-by-phase breakdown for each manager
-   **Comparison Tables**: Side-by-side comparison of both managers
-   **Performance Summary**: Overall winner and significant differences
-   **Phase Descriptions**: Context for each timing measurement

### Example Output

```
🔍 WebRTC Detailed Profiling
Stream Creation: 45.20ms (API call to create stream on server)
  └─ Phase duration: 45.20ms
PeerConnection Creation: 45.85ms (Creating WebRTC peer connection object)
  └─ Phase duration: 0.65ms
Offer Set: 46.12ms (Setting remote description (server offer))
  └─ Phase duration: 0.27ms
Answer Created: 46.45ms (Creating SDP answer)
  └─ Phase duration: 0.33ms
Answer Set: 46.78ms (Setting local description (client answer))
  └─ Phase duration: 0.33ms
Connection Started: 47.15ms (Sending answer to server)
  └─ Phase duration: 0.37ms
First Track Received: 1250.30ms (First media track received from server)
  └─ Phase duration: 1203.15ms
Video Rendered: 1251.45ms (Video element shows content)
  └─ Phase duration: 1.15ms

📈 Total time to video render: 1251.45ms

📊 Streaming Manager Performance Comparison
┌─────────────────────────┬─────────────┬─────────────┬─────────────┬─────────┐
│ (index)                 │ WebRTC      │ LiveKit     │ Difference  │ Winner  │
├─────────────────────────┼─────────────┼─────────────┼─────────────┼─────────┤
│ Stream Creation         │ '45.20ms'   │ '38.50ms'   │ '6.70ms'    │ 'LiveKit'│
│ First Track Received    │ '1250.30ms' │ '890.20ms'  │ '360.10ms'  │ 'LiveKit'│
│ Video Rendered          │ '1251.45ms' │ '891.35ms'  │ '360.10ms'  │ 'LiveKit'│
└─────────────────────────┴─────────────┴─────────────┴─────────────┴─────────┘

🏆 Overall Performance:
WebRTC Total: 1251.45ms
LiveKit Total: 891.35ms
Difference: 360.10ms
Winner: LiveKit
⚠️  Significant performance difference detected!
```

## API Reference

### Functions

-   `enableStreamingProfiling()`: Enable profiling comparison mode
-   `resetStreamingProfiling()`: Reset all profiling data
-   `calculateProfilingResults(timestamps)`: Calculate relative timings from absolute timestamps
-   `compareProfilingResults(webrtc, livekit, name?)`: Compare two sets of profiling results
-   `logDetailedProfiling(manager, timestamps, descriptions?)`: Log detailed profiling information

### Classes

-   `StreamingManagerProfiler`: Main profiling class for managing timestamps and comparisons

## Development

The profiling system is automatically enabled in development mode (`NODE_ENV === 'development'`). In production, you need to explicitly enable it.

## Performance Impact

The profiling system has minimal performance impact:

-   Uses `performance.now()` for high-precision timing
-   Only stores timestamps, no heavy computations
-   Console logging only occurs when video is rendered
-   Can be disabled in production builds

## Troubleshooting

### No Profiling Output

1. Ensure you're calling `enableStreamingProfiling()` before creating managers
2. Check that video is actually being rendered (profiling only logs when video appears)
3. Verify you're in development mode or have explicitly enabled profiling

### Missing Comparison Data

1. Make sure both WebRTC and LiveKit managers complete successfully
2. Check that both managers receive video content
3. Verify profiling is enabled before creating either manager

### TypeScript Errors

1. Ensure you're importing the correct types from the profiling utilities
2. Check that your timestamps object includes the required `init` property
3. Verify all imports are from the correct paths
