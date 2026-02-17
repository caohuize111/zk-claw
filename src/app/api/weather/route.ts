import { NextResponse } from "next/server";

// Simulated DePIN weather station data
const STATIONS = [
  {
    stationId: 1001,
    name: "Marco Station Alpha",
    location: "Singapore",
    data: {
      temperature: -8 + Math.random() * 5,
      humidity: 95 + Math.random() * 5,
      windSpeed: 110 + Math.random() * 30,
      rainfall: 230 + Math.random() * 50,
    },
  },
  {
    stationId: 1002,
    name: "Marco Station Beta",
    location: "Dubai",
    data: {
      temperature: 42 + Math.random() * 3,
      humidity: 25 + Math.random() * 10,
      windSpeed: 5 + Math.random() * 10,
      rainfall: Math.random() * 2,
    },
  },
  {
    stationId: 1003,
    name: "Marco Station Gamma",
    location: "Tokyo",
    data: {
      temperature: 20 + Math.random() * 10,
      humidity: 55 + Math.random() * 20,
      windSpeed: 10 + Math.random() * 15,
      rainfall: 5 + Math.random() * 20,
    },
  },
];

export async function GET() {
  const stations = STATIONS.map((s) => ({
    ...s,
    timestamp: new Date().toISOString(),
    signature: `0x${Buffer.from(JSON.stringify(s.data)).toString("hex").slice(0, 64)}`,
  }));

  return NextResponse.json({ stations });
}
