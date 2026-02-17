import mqtt from "mqtt";

export class MqttTransport {
  private client: mqtt.MqttClient | null = null;
  private messageCallbacks: Map<string, (topic: string, payload: Buffer) => void> = new Map();

  connect(brokerUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("MQTT connection timeout"));
      }, 10000);

      this.client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        reconnectPeriod: 5000,
      });
      this.client.on("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.client.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      this.client.on("message", (topic, payload) => {
        for (const [, cb] of this.messageCallbacks) {
          try {
            cb(topic, payload);
          } catch (err) {
            console.error("[MQTT] Error in message callback:", err);
          }
        }
      });
    });
  }

  subscribe(topic: string, callback: (topic: string, payload: Buffer) => void): string {
    if (!this.client) throw new Error("Not connected");
    const id = Math.random().toString(36).slice(2);
    this.messageCallbacks.set(id, callback);
    this.client.subscribe(topic);
    return id;
  }

  unsubscribe(callbackId: string): void {
    this.messageCallbacks.delete(callbackId);
  }

  publish(topic: string, payload: string | Buffer): void {
    if (!this.client) throw new Error("Not connected");
    this.client.publish(topic, payload);
  }

  disconnect(): void {
    this.client?.end();
    this.client = null;
  }
}
