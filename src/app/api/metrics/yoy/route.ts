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
    const metric = (searchParams.get("metric") || "revenue") as "revenue" | "profit";

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

    const today = aggregateByUnit(filtered.slice(-1), "day", metric)[0];
    const week = aggregateByUnit(filtered.slice(-7), "week_fixed_7d", metric)[0];
    const month = aggregateByUnit(filtered, "month", metric).slice(-1)[0];

    const today_yoy = today && today.value_2025 > 0 ? (today.value_2026 / today.value_2025) * 100 : null;
    const week_yoy = week && week.value_2025 > 0 ? (week.value_2026 / week.value_2025) * 100 : null;
    const month_yoy = month && month.value_2025 > 0 ? (month.value_2026 / month.value_2025) * 100 : null;

    return NextResponse.json({
      baseline: 100,
      yoy_pct: {
        today: today_yoy ? Math.round(today_yoy * 100) / 100 : null,
        week: week_yoy ? Math.round(week_yoy * 100) / 100 : null,
        month: month_yoy ? Math.round(month_yoy * 100) / 100 : null,
      },
      yoy_ratio: {
        today: today_yoy ? Math.round((today_yoy / 100) * 10000) / 10000 : null,
        week: week_yoy ? Math.round((week_yoy / 100) * 10000) / 10000 : null,
        month: month_yoy ? Math.round((month_yoy / 100) * 10000) / 10000 : null,
      },
      loaded_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

