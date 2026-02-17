import { createLightNode, waitForRemotePeer, Protocols } from "@waku/sdk";
import { createDecoder, createEncoder } from "@waku/sdk";

const CONTENT_TOPIC = "/zkclaw/1/depin-weather/proto";

export class WakuTransport {
  private node: any = null;

  async connect(): Promise<void> {
    this.node = await createLightNode({ defaultBootstrap: true });
    await this.node.start();
    await waitForRemotePeer(this.node, [Protocols.Filter, Protocols.LightPush]);
  }

  async subscribe(callback: (message: any) => void): Promise<void> {
    if (!this.node) throw new Error("Not connected");
    const decoder = createDecoder(CONTENT_TOPIC);
    await this.node.filter.subscribe([decoder], (msg: any) => {
      if (msg.payload) {
        try {
          callback(JSON.parse(new TextDecoder().decode(msg.payload)));
        } catch (err) {
          console.error("[WAKU] Failed to parse message:", err);
        }
      }
    });
  }

  async publish(data: object): Promise<void> {
    if (!this.node) throw new Error("Not connected");
    const encoder = createEncoder({ contentTopic: CONTENT_TOPIC });
    await this.node.lightPush.send(encoder, {
      payload: new TextEncoder().encode(JSON.stringify(data)),
    });
  }

  async disconnect(): Promise<void> {
    await this.node?.stop();
    this.node = null;
  }
}
