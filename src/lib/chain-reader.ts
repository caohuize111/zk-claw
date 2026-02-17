import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { CONTRACTS } from "./contract-addresses";
import { GATEWAY_ABI, NFA_ABI } from "./contracts";

// Server-side viem client for reading chain data (5s timeout to avoid blocking SSR)
export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http("https://bsc-testnet-rpc.publicnode.com", { timeout: 5_000 }),
});

export async function fetchAgents() {
  try {
    const totalAgents = await publicClient.readContract({
      address: CONTRACTS.NFA as `0x${string}`,
      abi: NFA_ABI,
      functionName: "totalAgents",
    });

    const count = Number(totalAgents);
    const agents = [];

    for (let i = 0; i < count; i++) {
      const [metadata, profile] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.NFA as `0x${string}`,
          abi: NFA_ABI,
          functionName: "getMetadata",
          args: [BigInt(i)],
        }),
        publicClient.readContract({
          address: CONTRACTS.NFA as `0x${string}`,
          abi: NFA_ABI,
          functionName: "getProfile",
          args: [BigInt(i)],
        }),
      ]);

      const meta = metadata as any;
      const prof = profile as any;

      agents.push({
        id: i,
        name: meta.name,
        persona: meta.persona,
        vaultURI: meta.vaultURI,
        vaultHash: meta.vaultHash,
        totalPredictions: Number(prof.totalPredictions),
        correctPredictions: Number(prof.correctPredictions),
        reputationScore: Number(prof.reputationScore),
        learningRoot: prof.learningRoot,
      });
    }

    return agents;
  } catch (e) {
    console.error("fetchAgents error:", e);
    return [];
  }
}

export async function fetchGatewayStats() {
  try {
    const [totalVerifications, totalClaimsTriggered, totalRecords, totalAuthenticated] =
      await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.ZKClawGateway as `0x${string}`,
          abi: GATEWAY_ABI,
          functionName: "totalVerifications",
        }),
        publicClient.readContract({
          address: CONTRACTS.ZKClawGateway as `0x${string}`,
          abi: GATEWAY_ABI,
          functionName: "totalClaimsTriggered",
        }),
        publicClient.readContract({
          address: CONTRACTS.ZKClawGateway as `0x${string}`,
          abi: GATEWAY_ABI,
          functionName: "totalRecords",
        }),
        publicClient.readContract({
          address: CONTRACTS.ZKClawGateway as `0x${string}`,
          abi: [{
            inputs: [],
            name: "totalAuthenticated",
            outputs: [{ type: "uint256" }],
            stateMutability: "view",
            type: "function",
          }],
          functionName: "totalAuthenticated",
        }),
      ]);

    return {
      totalVerifications: Number(totalVerifications),
      totalClaimsTriggered: Number(totalClaimsTriggered),
      totalRecords: Number(totalRecords),
      totalAuthenticated: Number(totalAuthenticated),
    };
  } catch (e) {
    console.error("fetchGatewayStats error:", e);
    return { totalVerifications: 0, totalClaimsTriggered: 0, totalRecords: 0, totalAuthenticated: 0 };
  }
}

export async function fetchRecords(limit = 10) {
  try {
    const totalRecords = await publicClient.readContract({
      address: CONTRACTS.ZKClawGateway as `0x${string}`,
      abi: GATEWAY_ABI,
      functionName: "totalRecords",
    });

    const count = Number(totalRecords);
    const records = [];
    const start = Math.max(0, count - limit);

    for (let i = count - 1; i >= start; i--) {
      const record = (await publicClient.readContract({
        address: CONTRACTS.ZKClawGateway as `0x${string}`,
        abi: [{
          inputs: [{ name: "index", type: "uint256" }],
          name: "getRecord",
          outputs: [{
            components: [
              { name: "agentId", type: "uint256" },
              { name: "proofHash", type: "bytes32" },
              { name: "inputHash", type: "bytes32" },
              { name: "publicInstances", type: "uint256[]" },
              { name: "timestamp", type: "uint256" },
              { name: "verified", type: "bool" },
              { name: "decision", type: "uint8" },
              { name: "dataAuthentic", type: "bool" },
            ],
            type: "tuple",
          }],
          stateMutability: "view",
          type: "function",
        }],
        functionName: "getRecord",
        args: [BigInt(i)],
      })) as any;

      records.push({
        index: i,
        agentId: Number(record.agentId),
        proofHash: record.proofHash,
        inputHash: record.inputHash,
        timestamp: Number(record.timestamp),
        verified: record.verified,
        decision: record.decision === 1 ? "CLAIM" : "NORMAL",
        dataAuthentic: record.dataAuthentic,
      });
    }

    return records;
  } catch (e) {
    console.error("fetchRecords error:", e);
    return [];
  }
}

export async function fetchAgentRecords(agentId: number) {
  try {
    const indices = (await publicClient.readContract({
      address: CONTRACTS.ZKClawGateway as `0x${string}`,
      abi: [{
        inputs: [{ name: "agentId", type: "uint256" }],
        name: "getAgentRecords",
        outputs: [{ type: "uint256[]" }],
        stateMutability: "view",
        type: "function",
      }],
      functionName: "getAgentRecords",
      args: [BigInt(agentId)],
    })) as bigint[];

    const records = [];
    for (const idx of indices) {
      const record = (await publicClient.readContract({
        address: CONTRACTS.ZKClawGateway as `0x${string}`,
        abi: [{
          inputs: [{ name: "index", type: "uint256" }],
          name: "getRecord",
          outputs: [{
            components: [
              { name: "agentId", type: "uint256" },
              { name: "proofHash", type: "bytes32" },
              { name: "inputHash", type: "bytes32" },
              { name: "publicInstances", type: "uint256[]" },
              { name: "timestamp", type: "uint256" },
              { name: "verified", type: "bool" },
              { name: "decision", type: "uint8" },
              { name: "dataAuthentic", type: "bool" },
            ],
            type: "tuple",
          }],
          stateMutability: "view",
          type: "function",
        }],
        functionName: "getRecord",
        args: [idx],
      })) as any;

      records.push({
        index: Number(idx),
        agentId: Number(record.agentId),
        proofHash: record.proofHash,
        inputHash: record.inputHash,
        timestamp: Number(record.timestamp),
        verified: record.verified,
        decision: record.decision === 1 ? "CLAIM" : "NORMAL",
        dataAuthentic: record.dataAuthentic,
      });
    }

    return records;
  } catch (e) {
    console.error("fetchAgentRecords error:", e);
    return [];
  }
}
