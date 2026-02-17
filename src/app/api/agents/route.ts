import { NextResponse } from "next/server";
import { fetchAgents, fetchGatewayStats } from "@/lib/chain-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  const [agents, stats] = await Promise.all([
    fetchAgents(),
    fetchGatewayStats(),
  ]);

  return NextResponse.json({
    agents,
    total: agents.length,
    stats,
  });
}
