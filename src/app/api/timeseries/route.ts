import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

const CSV_PATH = path.join(process.cwd(), "data", "sales.csv");

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
    profit_2026: (parseFloat(row.revenue_2026) || 0) - (parseFloat(row.COGS_2026) || 0) - (parseFloat(row.Discount_2026) || 0),
    profit_2025: (parseFloat(row.revenue_2025) || 0) - (parseFloat(row.COGS_2025) || 0) - (parseFloat(row.Discount_2025) || 0),
  }));
}

function aggregateByUnit(
  data: any[],
  unit: "day" | "week_fixed_7d" | "week_iso" | "month",
  metric: "revenue" | "profit"
) {
  const value_2026 = `${metric}_2026`;
  const value_2025 = `${metric}_2025`;

  if (unit === "day") {
    return data.map((row) => ({
      label: row.date,
      value_2026: row[value_2026],
      value_2025: row[value_2025],
    }));
  }

  if (unit === "week_fixed_7d") {
    const buckets: Record<number, { value_2026: number; value_2025: number }> = {};
    data.forEach((row, index) => {
      const bucket = Math.floor(index / 7);
      if (!buckets[bucket]) {
        buckets[bucket] = { value_2026: 0, value_2025: 0 };
      }
      buckets[bucket].value_2026 += row[value_2026];
      buckets[bucket].value_2025 += row[value_2025];
    });
    return Object.entries(buckets).map(([bucket, values]) => ({
      label: `W${parseInt(bucket) + 1}`,
      value_2026: values.value_2026,
      value_2025: values.value_2025,
    }));
  }

  if (unit === "week_iso") {
    const buckets: Record<string, { value_2026: number; value_2025: number }> = {};
    data.forEach((row) => {
      const date = new Date(row.date);
      const year = date.getFullYear();
      const week = getISOWeek(date);
      const key = `${year}-W${week.toString().padStart(2, "0")}`;
      if (!buckets[key]) {
        buckets[key] = { value_2026: 0, value_2025: 0 };
      }
      buckets[key].value_2026 += row[value_2026];
      buckets[key].value_2025 += row[value_2025];
    });
    return Object.entries(buckets)
      .sort()
      .map(([label, values]) => ({
        label,
        value_2026: values.value_2026,
        value_2025: values.value_2025,
      }));
  }

  const buckets: Record<string, { value_2026: number; value_2025: number }> = {};
  data.forEach((row) => {
    const label = row.date.slice(0, 7);
    if (!buckets[label]) {
      buckets[label] = { value_2026: 0, value_2025: 0 };
    }
    buckets[label].value_2026 += row[value_2026];
    buckets[label].value_2025 += row[value_2025];
  });
  return Object.entries(buckets)
    .sort()
    .map(([label, values]) => ({
      label,
      value_2026: values.value_2026,
      value_2025: values.value_2025,
    }));
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const season = searchParams.get("season");
    const item = searchParams.get("item");
    const unit = (searchParams.get("unit") || "day") as "day" | "week_fixed_7d" | "week_iso" | "month";
    const metric = (searchParams.get("metric") || "revenue") as "revenue" | "profit";

    const data = loadCSV();
    let filtered = data;

    if (season) {
      filtered = filtered.filter((row) => row.season === season);
    }
    if (item) {
      filtered = filtered.filter((row) => row.item === item);
    }
    if (start) {
      filtered = filtered.filter((row) => row.date >= start);
    }
    if (end) {
      filtered = filtered.filter((row) => row.date <= end);
    }

    filtered.sort((a, b) => a.date.localeCompare(b.date));

    const aggregated = aggregateByUnit(filtered, unit, metric);

    let cumulative_2026 = 0;
    let cumulative_2025 = 0;

    const yoy_pct_points: Array<{ x: string; y: number | null }> = [];
    const yoy_ratio_points: Array<{ x: string; y: number | null }> = [];
    const cum_2026_points: Array<{ x: string; y: number }> = [];
    const cum_2025_points: Array<{ x: string; y: number }> = [];

    aggregated.forEach((point) => {
      cumulative_2026 += point.value_2026;
      cumulative_2025 += point.value_2025;

      const yoy_pct = point.value_2025 > 0 ? (point.value_2026 / point.value_2025) * 100 : null;
      const yoy_ratio = yoy_pct !== null ? yoy_pct / 100 : null;

      yoy_pct_points.push({
        x: point.label,
        y: yoy_pct !== null ? Math.round(yoy_pct * 100) / 100 : null,
      });
      yoy_ratio_points.push({
        x: point.label,
        y: yoy_ratio !== null ? Math.round(yoy_ratio * 10000) / 10000 : null,
      });
      cum_2026_points.push({
        x: point.label,
        y: Math.round(cumulative_2026),
      });
      cum_2025_points.push({
        x: point.label,
        y: Math.round(cumulative_2025),
      });
    });

    return NextResponse.json({
      meta: {
        unit,
        metric,
        start: start || null,
        end: end || null,
        season: season || null,
        item: item || null,
        baseline: 100,
      },
      series: [
        { name: "yoy_pct", points: yoy_pct_points },
        { name: "yoy_ratio", points: yoy_ratio_points },
        { name: `cum_${metric}_2026`, points: cum_2026_points },
        { name: `cum_${metric}_2025_aligned`, points: cum_2025_points },
      ],
      loaded_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

