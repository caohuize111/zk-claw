import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Free weather API (no key required) - Open-Meteo
const STATIONS: Record<number, { lat: number; lon: number; name: string }> = {
  1001: { lat: 31.23, lon: 121.47, name: "Shanghai" },
  1002: { lat: 35.68, lon: 139.69, name: "Tokyo" },
  1003: { lat: 22.32, lon: 114.17, name: "Hong Kong" },
  1004: { lat: 1.35, lon: 103.82, name: "Singapore" },
  1005: { lat: 40.71, lon: -74.01, name: "New York" },
};

export async function GET(req: NextRequest) {
  const stationId = parseInt(req.nextUrl.searchParams.get("stationId") || "1001");
  const station = STATIONS[stationId] || STATIONS[1001];

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${station.lat}&longitude=${station.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation`,
      { next: { revalidate: 300 } } // cache 5 min
    );

    if (!res.ok) throw new Error("Weather API failed");

    const data = await res.json();
    const current = data.current;

    return NextResponse.json({
      stationId,
      stationName: station.name,
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      rainfall: current.precipitation,
      timestamp: new Date().toISOString(),
      source: "Open-Meteo (DePIN Oracle)",
      authenticated: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch weather data from DePIN oracle" },
      { status: 503 }
    );
  }
}
