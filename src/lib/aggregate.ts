import { CSVRecord } from "./csvLoader";

export type UnitKey = "day" | "week_fixed_7d" | "week_iso" | "month";
export type MetricKey = "revenue" | "profit";

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function filterData(
  data: CSVRecord[],
  options: {
    start?: string;
    end?: string;
    season?: string;
    item?: string;
  }
): CSVRecord[] {
  let filtered = [...data];

  if (options.season && options.season !== "전체") {
    filtered = filtered.filter((row) => row.season === options.season);
  }
  if (options.item && options.item !== "전체") {
    filtered = filtered.filter((row) => row.item === options.item);
  }
  if (options.start) {
    filtered = filtered.filter((row) => row.date >= options.start!);
  }
  if (options.end) {
    filtered = filtered.filter((row) => row.date <= options.end!);
  }

  return filtered.sort((a, b) => a.date.localeCompare(b.date));
}

export function aggregateByUnit(
  data: CSVRecord[],
  unit: UnitKey,
  metric: MetricKey
): Array<{ label: string; value_2026: number; value_2025: number }> {
  const value_2026 = `${metric}_2026` as keyof CSVRecord;
  const value_2025 = `${metric}_2025` as keyof CSVRecord;

  if (unit === "day") {
    return data.map((row) => ({
      label: row.date,
      value_2026: row[value_2026] as number,
      value_2025: row[value_2025] as number,
    }));
  }

  if (unit === "week_fixed_7d") {
    const buckets: Record<number, { value_2026: number; value_2025: number }> = {};
    data.forEach((row, index) => {
      const bucket = Math.floor(index / 7);
      if (!buckets[bucket]) {
        buckets[bucket] = { value_2026: 0, value_2025: 0 };
      }
      buckets[bucket].value_2026 += row[value_2026] as number;
      buckets[bucket].value_2025 += row[value_2025] as number;
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
      buckets[key].value_2026 += row[value_2026] as number;
      buckets[key].value_2025 += row[value_2025] as number;
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
    buckets[label].value_2026 += row[value_2026] as number;
    buckets[label].value_2025 += row[value_2025] as number;
  });
  return Object.entries(buckets)
    .sort()
    .map(([label, values]) => ({
      label,
      value_2026: values.value_2026,
      value_2025: values.value_2025,
    }));
}

export function buildTimeseries(
  data: CSVRecord[],
  unit: UnitKey,
  metric: MetricKey
): {
  series: Array<{
    name: string;
    points: Array<{ x: string; y: number | null }>;
  }>;
} {
  const aggregated = aggregateByUnit(data, unit, metric);

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

  return {
    series: [
      { name: "yoy_pct", points: yoy_pct_points },
      { name: "yoy_ratio", points: yoy_ratio_points },
      { name: `cum_${metric}_2026`, points: cum_2026_points },
      { name: `cum_${metric}_2025_aligned`, points: cum_2025_points },
    ],
  };
}

export function getItems(data: CSVRecord[]): Array<{
  item: string;
  revenue_2026: number;
  revenue_2025: number;
  yoy: number | null;
  progress: number;
}> {
  const ITEM_TARGET_REVENUE = 2_280_000;
  const grouped = data.reduce((acc, row) => {
    if (!acc[row.item]) {
      acc[row.item] = { revenue_2026: 0, revenue_2025: 0 };
    }
    acc[row.item].revenue_2026 += row.revenue_2026;
    acc[row.item].revenue_2025 += row.revenue_2025;
    return acc;
  }, {} as Record<string, { revenue_2026: number; revenue_2025: number }>);

  return Object.entries(grouped).map(([item, values]) => ({
    item,
    revenue_2026: Math.round(values.revenue_2026),
    revenue_2025: Math.round(values.revenue_2025),
    yoy:
      values.revenue_2025 > 0
        ? Math.round((values.revenue_2026 / values.revenue_2025) * 100 * 10) / 10
        : null,
    progress: Math.round((values.revenue_2026 / ITEM_TARGET_REVENUE) * 100 * 10) / 10,
  }));
}

export function getProgress(data: CSVRecord[]): {
  total_2026: number;
  total_2025: number;
  season_target_revenue: number;
  season_progress: number;
} {
  const SEASON_TARGET_REVENUE = 7_500_000;
  const total_2026 = data.reduce((sum, row) => sum + row.revenue_2026, 0);
  const total_2025 = data.reduce((sum, row) => sum + row.revenue_2025, 0);
  const season_progress =
    SEASON_TARGET_REVENUE > 0 ? (total_2026 / SEASON_TARGET_REVENUE) * 100 : 0;

  return {
    total_2026: Math.round(total_2026),
    total_2025: Math.round(total_2025),
    season_target_revenue: SEASON_TARGET_REVENUE,
    season_progress: Math.round(season_progress * 100) / 100,
  };
}

export function getYoY(
  data: CSVRecord[],
  metric: MetricKey,
  endDate?: string
): {
  baseline: number;
  yoy_pct: {
    today: number | null;
    week: number | null;
    month: number | null;
    ytd: number | null;
  };
  yoy_ratio: {
    today: number | null;
    week: number | null;
    month: number | null;
    ytd: number | null;
  };
} {
  const today = aggregateByUnit(data.slice(-1), "day", metric)[0];
  const week = aggregateByUnit(data.slice(-7), "week_fixed_7d", metric)[0];
  const month = aggregateByUnit(data, "month", metric).slice(-1)[0];

  // YTD 계산: 2026년 1월 1일부터 endDate까지 vs 2025년 1월 1일부터 같은 기간까지
  let ytd_yoy: number | null = null;
  if (endDate) {
    const ytdStart = "2026-01-01";
    const ytdData = data.filter((row) => row.date >= ytdStart && row.date <= endDate);
    
    const value_2026 = `${metric}_2026` as keyof CSVRecord;
    const value_2025 = `${metric}_2025` as keyof CSVRecord;
    
    const total_2026 = ytdData.reduce((sum, row) => sum + (row[value_2026] as number), 0);
    const total_2025 = ytdData.reduce((sum, row) => sum + (row[value_2025] as number), 0);
    
    ytd_yoy = total_2025 > 0 ? (total_2026 / total_2025) * 100 : null;
  }

  const today_yoy = today && today.value_2025 > 0 ? (today.value_2026 / today.value_2025) * 100 : null;
  const week_yoy = week && week.value_2025 > 0 ? (week.value_2026 / week.value_2025) * 100 : null;
  const month_yoy = month && month.value_2025 > 0 ? (month.value_2026 / month.value_2025) * 100 : null;

  return {
    baseline: 100,
    yoy_pct: {
      today: today_yoy ? Math.round(today_yoy * 100) / 100 : null,
      week: week_yoy ? Math.round(week_yoy * 100) / 100 : null,
      month: month_yoy ? Math.round(month_yoy * 100) / 100 : null,
      ytd: ytd_yoy ? Math.round(ytd_yoy * 100) / 100 : null,
    },
    yoy_ratio: {
      today: today_yoy ? Math.round((today_yoy / 100) * 10000) / 10000 : null,
      week: week_yoy ? Math.round((week_yoy / 100) * 10000) / 10000 : null,
      month: month_yoy ? Math.round((month_yoy / 100) * 10000) / 10000 : null,
      ytd: ytd_yoy ? Math.round((ytd_yoy / 100) * 10000) / 10000 : null,
    },
  };
}

