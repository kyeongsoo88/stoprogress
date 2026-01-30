import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

const CSV_PATH = path.join(process.cwd(), "data", "sales.csv");
const SEASON_TARGET_REVENUE = 7_500_000;

function loadCSV() {
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
  });
  return records.map((row: any) => ({
    date: row.date,
    season: row.Season,
    revenue_2026: parseFloat(row.revenue_2026) || 0,
    revenue_2025: parseFloat(row.revenue_2025) || 0,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const season = searchParams.get("season");

    const data = loadCSV();
    let filtered = data;

    if (season) {
      filtered = filtered.filter((row) => row.season === season);
    }
    if (start) {
      filtered = filtered.filter((row) => row.date >= start);
    }
    if (end) {
      filtered = filtered.filter((row) => row.date <= end);
    }

    const total_2026 = filtered.reduce((sum, row) => sum + row.revenue_2026, 0);
    const total_2025 = filtered.reduce((sum, row) => sum + row.revenue_2025, 0);
    const season_progress = SEASON_TARGET_REVENUE > 0 ? (total_2026 / SEASON_TARGET_REVENUE) * 100 : 0;

    return NextResponse.json({
      total_2026: Math.round(total_2026),
      total_2025: Math.round(total_2025),
      season_target_revenue: SEASON_TARGET_REVENUE,
      season_progress: Math.round(season_progress * 100) / 100,
      loaded_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

