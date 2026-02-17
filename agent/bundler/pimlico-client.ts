export interface PackedUserOperation {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  signature: string;
}

export class PimlicoClient {
  private baseUrl: string;

  constructor(
    private apiKey: string,
    private chainId: number
  ) {
    this.baseUrl = `https://api.pimlico.io/v2/${chainId}/rpc`;
  }

  private async rpc(method: string, params: any[]): Promise<any> {
    const res = await fetch(`${this.baseUrl}?apikey=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Pimlico RPC error: ${data.error.message}`);
    return data.result;
  }

  async estimateUserOperationGas(
    userOp: PackedUserOperation,
    entryPoint: string
  ): Promise<{ callGasLimit: string; verificationGasLimit: string; preVerificationGas: string }> {
    return this.rpc("eth_estimateUserOperationGas", [userOp, entryPoint]);
  }

  async sendUserOperation(
    userOp: PackedUserOperation,
    entryPoint: string
  ): Promise<string> {
    return this.rpc("eth_sendUserOperation", [userOp, entryPoint]);
  }

  async getUserOperationReceipt(userOpHash: string): Promise<any> {
    return this.rpc("eth_getUserOperationReceipt", [userOpHash]);
  }

  async waitForReceipt(userOpHash: string, timeoutMs: number = 60000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const receipt = await this.getUserOperationReceipt(userOpHash);
      if (receipt) return receipt;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Timeout waiting for UserOperation receipt: ${userOpHash}`);
  }
}
