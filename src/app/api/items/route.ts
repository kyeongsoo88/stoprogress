import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

const CSV_PATH = path.join(process.cwd(), "data", "sales.csv");
const ITEM_TARGET_REVENUE = 2_280_000;

function loadCSV() {
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
  });
  return records.map((row: any) => ({
    date: row.date,
    season: row.Season,
    item: row.Item,
    revenue_2026: parseFloat(row.revenue_2026) || 0,
    revenue_2025: parseFloat(row.revenue_2025) || 0,
    COGS_2026: parseFloat(row.COGS_2026) || 0,
    COGS_2025: parseFloat(row.COGS_2025) || 0,
    Discount_2026: parseFloat(row.Discount_2026) || 0,
    Discount_2025: parseFloat(row.Discount_2025) || 0,
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

    const grouped = filtered.reduce((acc, row) => {
      if (!acc[row.item]) {
        acc[row.item] = { item: row.item, revenue_2026: 0, revenue_2025: 0 };
      }
      acc[row.item].revenue_2026 += row.revenue_2026;
      acc[row.item].revenue_2025 += row.revenue_2025;
      return acc;
    }, {} as Record<string, { item: string; revenue_2026: number; revenue_2025: number }>);

    const items = Object.values(grouped).map((item) => ({
      item: item.item,
      revenue_2026: Math.round(item.revenue_2026),
      revenue_2025: Math.round(item.revenue_2025),
      yoy: item.revenue_2025 > 0 ? Math.round((item.revenue_2026 / item.revenue_2025) * 100 * 10) / 10 : null,
      progress: Math.round((item.revenue_2026 / ITEM_TARGET_REVENUE) * 100 * 10) / 10,
    }));

    return NextResponse.json({ items, loaded_at: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

