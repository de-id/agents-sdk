/**
 * Streaming strategies for different transport protocols
 *
 * This module contains implementations for:
 * - WebRTC: Peer-to-peer streaming with RTC data channels
 * - LiveKit: Room-based streaming with LiveKit infrastructure
 */

export { streamingManagerStrategyFactory } from './factory';
export type { ExtendedAgentManagerOptions, InitializationResult, StreamingStrategy } from './types';
