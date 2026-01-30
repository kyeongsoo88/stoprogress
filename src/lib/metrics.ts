import { DailyRecord, MetricKey, UnitKey } from "./data";

export type AggregatePoint = {
  label: string;
  value2026: number;
  value2025: number;
};

export type CumulativePoint = AggregatePoint & {
  cumulative2026: number;
  cumulative2025: number;
};

export function filterByDate(
  records: DailyRecord[],
  start: string,
  end: string
) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
    return records;
  }
  return records.filter((record) => {
    const current = new Date(record.date);
    return current >= startDate && current <= endDate;
  });
}

export function aggregateRecords(
  records: DailyRecord[],
  unit: UnitKey,
  metric: MetricKey
): AggregatePoint[] {
  if (records.length === 0) {
    return [];
  }

  if (unit === "day") {
    return records.map((record) => ({
      label: record.date.slice(5),
      value2026: record[`${metric}2026` as const],
      value2025: record[`${metric}2025` as const],
    }));
  }

  if (unit === "week_fixed_7d") {
    const chunks: AggregatePoint[] = [];
    records.forEach((record, index) => {
      const bucket = Math.floor(index / 7);
      if (!chunks[bucket]) {
        chunks[bucket] = {
          label: `W${bucket + 1}`,
          value2026: 0,
          value2025: 0,
        };
      }
      chunks[bucket].value2026 += record[`${metric}2026` as const];
      chunks[bucket].value2025 += record[`${metric}2025` as const];
    });
    return chunks;
  }

  if (unit === "week_iso") {
    const buckets = new Map<string, AggregatePoint>();
    records.forEach((record) => {
      const date = new Date(record.date);
      const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = day.getUTCDay() || 7;
      day.setUTCDate(day.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      const label = `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
      const existing = buckets.get(label) ?? {
        label,
        value2026: 0,
        value2025: 0,
      };
      existing.value2026 += record[`${metric}2026` as const];
      existing.value2025 += record[`${metric}2025` as const];
      buckets.set(label, existing);
    });
    return Array.from(buckets.values());
  }

  const monthMap = new Map<string, AggregatePoint>();
  records.forEach((record) => {
    const label = record.date.slice(0, 7);
    const existing = monthMap.get(label) ?? {
      label,
      value2026: 0,
      value2025: 0,
    };
    existing.value2026 += record[`${metric}2026` as const];
    existing.value2025 += record[`${metric}2025` as const];
    monthMap.set(label, existing);
  });

  return Array.from(monthMap.values());
}

export function toCumulative(points: AggregatePoint[]): CumulativePoint[] {
  let cumulative2026 = 0;
  let cumulative2025 = 0;
  return points.map((point) => {
    cumulative2026 += point.value2026;
    cumulative2025 += point.value2025;
    return {
      ...point,
      cumulative2026,
      cumulative2025,
    };
  });
}

export function formatCurrency(value: number) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

