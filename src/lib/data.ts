export type MetricKey = "revenue" | "profit";
export type UnitKey = "day" | "week_fixed_7d" | "week_iso" | "month";

export type DailyRecord = {
  date: string;
  revenue2026: number;
  revenue2025: number;
  profit2026: number;
  profit2025: number;
};

export type ApiRecord = {
  date: string;
  revenue_2026: number;
  revenue_2025: number;
  profit_2026: number;
  profit_2025: number;
};

export type ApiItem = {
  item: string;
  revenue_2026: number;
  revenue_2025: number;
  yoy: number;
  progress: number;
};

export type ApiResponse = {
  records: ApiRecord[];
  items: ApiItem[];
  item_records: ApiRecord[];
  season_target_revenue: number;
  loaded_at: string | null;
};

export type TimeseriesPoint = {
  label: string;
  value_2026: number;
  value_2025: number;
  cumulative_2026: number;
  cumulative_2025: number;
  yoy: number | null;
};

export type TimeseriesResponse = {
  meta: {
    unit: UnitKey;
    metric: MetricKey;
    start: string | null;
    end: string | null;
    season?: string | null;
    item?: string | null;
    baseline: number;
  };
  series: Array<{
    name: string;
    points: Array<{ x: string; y: number | null }>;
  }>;
  loaded_at: string | null;
};

export type ItemsResponse = {
  items: ApiItem[];
  loaded_at: string | null;
};

export type ProgressResponse = {
  total_2026: number;
  total_2025: number;
  season_target_revenue: number;
  season_progress: number;
  loaded_at: string | null;
};

export type YoyResponse = {
  baseline: number;
  yoy_pct: {
    today: number | null;
    week: number | null;
    month: number | null;
  };
  yoy_ratio: {
    today: number | null;
    week: number | null;
    month: number | null;
  };
  loaded_at: string | null;
};

export type ItemPerformance = {
  item: string;
  revenue2026: number;
  revenue2025: number;
  yoy: number;
  progress: number;
};

const startDate = new Date("2026-01-01T00:00:00");
const daysInSample = 31;

export const dailyRecords: DailyRecord[] = Array.from(
  { length: daysInSample },
  (_, index) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);
    const base = 120_000 + index * 1_600;
    const seasonality = 1 + Math.sin(index / 5.5) * 0.08;
    const revenue2026 = Math.round(base * seasonality);
    const revenue2025 = Math.round(base * 0.92 * seasonality);
    const profit2026 = Math.round(revenue2026 * 0.28);
    const profit2025 = Math.round(revenue2025 * 0.27);

    return {
      date: date.toISOString().slice(0, 10),
      revenue2026,
      revenue2025,
      profit2026,
      profit2025,
    };
  }
);

export const itemPerformance: ItemPerformance[] = [
  {
    item: "Item Alpha",
    revenue2026: 1_450_000,
    revenue2025: 1_210_000,
    yoy: 119.8,
    progress: 63.5,
  },
  {
    item: "Item Beta",
    revenue2026: 1_120_000,
    revenue2025: 1_080_000,
    yoy: 103.7,
    progress: 58.2,
  },
  {
    item: "Item Gamma",
    revenue2026: 920_000,
    revenue2025: 1_020_000,
    yoy: 90.2,
    progress: 44.9,
  },
  {
    item: "Item Delta",
    revenue2026: 780_000,
    revenue2025: 720_000,
    yoy: 108.3,
    progress: 51.6,
  },
  {
    item: "Item Epsilon",
    revenue2026: 640_000,
    revenue2025: 600_000,
    yoy: 106.7,
    progress: 38.3,
  },
];

const itemSeriesConfig = [
  { name: "Item Alpha", scale2026: 0.35, scale2025: 0.31 },
  { name: "Item Beta", scale2026: 0.28, scale2025: 0.27 },
  { name: "Item Gamma", scale2026: 0.22, scale2025: 0.25 },
  { name: "Item Delta", scale2026: 0.18, scale2025: 0.17 },
  { name: "Item Epsilon", scale2026: 0.15, scale2025: 0.14 },
];

export const itemDailySeries: Record<string, DailyRecord[]> = Object.fromEntries(
  itemSeriesConfig.map(({ name, scale2026, scale2025 }) => [
    name,
    dailyRecords.map((record) => ({
      ...record,
      revenue2026: Math.round(record.revenue2026 * scale2026),
      revenue2025: Math.round(record.revenue2025 * scale2025),
      profit2026: Math.round(record.profit2026 * scale2026),
      profit2025: Math.round(record.profit2025 * scale2025),
    })),
  ])
);

export const seasonTargetRevenue = 7_500_000;

