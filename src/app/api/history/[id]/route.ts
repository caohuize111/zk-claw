import { NextRequest, NextResponse } from "next/server";
import { fetchAgentRecords, fetchAgents } from "@/lib/chain-reader";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = parseInt(params.id);

  const [records, agents] = await Promise.all([
    fetchAgentRecords(agentId),
    fetchAgents(),
  ]);

  const agent = agents.find((a) => a.id === agentId) || null;

  return NextResponse.json({
    agentId,
    agent,
    history: records,
    total: records.length,
  });
}
