# Streaming Manager Profiling Scripts

This directory contains scripts for profiling and comparing the performance of WebRTC and LiveKit streaming managers.

## Scripts

-   `profile-streaming.ts` - TypeScript profiling script (recommended)
-   `profile-streaming.js` - JavaScript profiling script (requires built dist)

## Usage

### Prerequisites

1. Set up your environment variables:

    ```bash
    export VITE_AGENT_ID="your_agent_id"
    export VITE_CLIENT_KEY="your_client_key"
    export VITE_DID_API_URL="https://api.d-id.com"
    export VITE_WS_ENDPOINT="wss://api.d-id.com"
    ```

2. Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

### Running the Profiling

#### Option 1: Using npm/yarn scripts (Recommended)

```bash
# TypeScript version (requires tsx)
npm run profile

# JavaScript version (requires built dist)
npm run profile:js
```

#### Option 2: Direct execution

```bash
# TypeScript version
npx tsx scripts/profile-streaming.ts

# JavaScript version (after building)
npm run build:dev
node scripts/profile-streaming.js
```

## What the Script Does

1. **Enables Profiling**: Automatically enables the profiling comparison mode
2. **Tests WebRTC Manager**: Creates a WebRTC streaming manager in legacy mode
3. **Tests LiveKit Manager**: Creates a LiveKit streaming manager in fluent mode
4. **Measures Performance**: Times each phase from initialization to video render
5. **Compares Results**: Shows side-by-side comparison of both managers
6. **Provides Insights**: Identifies which manager is faster and by how much

## Expected Output

The script will output detailed profiling information including:

-   Individual manager performance breakdowns
-   Phase-by-phase timing analysis
-   Side-by-side comparison tables
-   Overall performance winner
-   Significant performance differences (if any)

## Environment Variables

| Variable            | Required | Description                | Example                |
| ------------------- | -------- | -------------------------- | ---------------------- |
| `VITE_AGENT_ID`     | ✅       | Your D-ID agent ID         | `agent_1234567890`     |
| `VITE_CLIENT_KEY`   | ✅       | Your D-ID client key       | `your_client_key_here` |
| `VITE_DID_API_URL`  | ✅       | D-ID API base URL          | `https://api.d-id.com` |
| `VITE_WS_ENDPOINT`  | ✅       | WebSocket endpoint URL     | `wss://api.d-id.com`   |
| `VITE_MIXPANEL_KEY` | ❌       | Mixpanel key for analytics | `your_mixpanel_key`    |
| `VITE_NODE_ENV`     | ❌       | Node environment           | `development`          |

## Troubleshooting

### Missing Environment Variables

If you see an error about missing environment variables, make sure all required variables are set:

```bash
echo $VITE_AGENT_ID
echo $VITE_CLIENT_KEY
echo $VITE_DID_API_URL
echo $VITE_WS_ENDPOINT
```

### Build Required for JavaScript Version

If using the JavaScript version, make sure to build the project first:

```bash
npm run build:dev
```

### TypeScript Compilation Errors

If you encounter TypeScript errors, make sure all dependencies are installed:

```bash
npm install
```

## Customization

You can modify the test parameters in the script:

-   `testText`: The text message to send to the agent
-   `testTimeout`: Maximum time to wait for each test
-   `streamOptions`: Configuration for the streaming managers

## Example Output

```
🚀 Starting Streaming Manager Profiling...
📋 Agent ID: agent_1234567890
🌐 API URL: https://api.d-id.com
🔌 WebSocket URL: wss://api.d-id.com

📊 Starting profiling tests...

🔧 Testing WebRTC Manager (Legacy)...
[WebRTC] Connection state: connecting
[WebRTC] Connection state: connected
✅ WebRTC Manager connected
[WebRTC] Video stream ready
[WebRTC] Video state: start
✅ WebRTC Manager spoke test message
✅ WebRTC Manager disconnected

==================================================

🔧 Testing LiveKit Manager (Fluent)...
[LiveKit] Connection state: connecting
[LiveKit] Connection state: connected
✅ LiveKit Manager connected
[LiveKit] Video stream ready
[LiveKit] Video state: start
✅ LiveKit Manager spoke test message
✅ LiveKit Manager disconnected

🎉 Profiling completed in 15432ms
📈 Check the console output above for detailed performance comparisons.
```
