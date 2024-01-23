/**
 * SocketService
 * Incapsulates the websocket business logic
 */
import { WebSocket, Data } from "ws";

/**
 * Default socket url
 * prod - wss://notifications.d-id.com
 * dev - wss://notifications-dev.d-id.com
 * @type {string}
 */
const DEFAULT_SOKET_URL = "wss://notifications.d-id.com";

/**
 * SocketService
 */
export class SocketService {
  /**
   * @property apiKey
   */
  private apiKey: string;

  /**
   * @property socket
   */
  private socket: WebSocket | null = null;

  /**
   * @property instance
   */
  private static instance: SocketService | null = null;

  //TODO rewrite apiKey part
  private constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ensureWebSocketConnection();
  }

  /**
   *
   * @param apiKey
   * @returns
   */
  public static getInstance(apiKey: string): SocketService {
    if (this.instance === null) {
      this.instance = new SocketService(apiKey);
    }
    return this.instance;
  }

  /**
   * Get connection params
   * @private
   * @returns
   */
  private getConnectionParams(): URLSearchParams {
    const authParams = new URLSearchParams();
    authParams.set("authorization", `Basic ${this.apiKey}`);
    return authParams;
  }

  /**
   * Ensure that the websocket connection is open
   */
  private ensureWebSocketConnection(): void {
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
      try {
        const authParams = this.getConnectionParams();
        const socketUrl = `${DEFAULT_SOKET_URL}?${authParams.toString()}`;
        this.socket = new WebSocket(socketUrl);
      } catch (err) {
        console.error("Error creating websocket connection:", err);
      }
    }
  }

  /**
   *
   * @param event
   * @param callback
   */
  public on(event: string, callback: (data: Data) => void): void {
    this.socket?.on(event, callback);
  }
}