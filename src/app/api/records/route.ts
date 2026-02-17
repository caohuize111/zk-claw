import { NextResponse } from "next/server";
import { fetchRecords } from "@/lib/chain-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  const records = await fetchRecords(20);
  return NextResponse.json({ records, total: records.length });
}
