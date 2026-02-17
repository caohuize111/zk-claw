import { NextRequest, NextResponse } from "next/server";

// Demo verification history
const HISTORIES: Record<string, any[]> = {
  "0": [
    {
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      decision: "CLAIM",
      verified: true,
      proofHash: "0x7ba0ffef93f5e1439170b97948e833285d588181",
      inputs: { temperature: -8, humidity: 98, windSpeed: 120, rainfall: 250 },
      stationId: 1001,
    },
    {
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      decision: "NORMAL",
      verified: true,
      proofHash: "0x036c00000000000000000000000000000000000000",
      inputs: { temperature: 25, humidity: 60, windSpeed: 15, rainfall: 5 },
      stationId: 1001,
    },
  ],
  "1": [
    {
      timestamp: new Date(Date.now() - 5400000).toISOString(),
      decision: "CLAIM",
      verified: true,
      proofHash: "0x4b1f000000000000000000000000000000000000",
      inputs: { temperature: -10, humidity: 99, windSpeed: 130, rainfall: 280 },
      stationId: 2001,
    },
  ],
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id;
  const history = HISTORIES[agentId] || [];
  return NextResponse.json({ agentId, history, total: history.length });
}
