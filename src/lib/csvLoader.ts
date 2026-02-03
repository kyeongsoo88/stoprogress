export type CSVRecord = {
  date: string;
  season: string;
  season_2025: string;
  item: string;
  revenue_2026: number;
  revenue_2025: number;
  profit_2026: number;
  profit_2025: number;
};

type YearData = {
  date: string;
  Season: string;
  Item: string;
  MSRP: string;
  revenue: string;
  COGS: string;
  Discount: string;
};

let csvCache: CSVRecord[] | null = null;
let csvCacheTime: number = 0;
const CACHE_TTL = 100; // 0.1초 캐시 (개발 중 CSV 수정 시 즉시 반영)

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });
    records.push(record);
  }

  return records;
}

function getMonthDay(date: string): string {
  return date.slice(5, 10);
}

function normalizeSeason(season: string): string {
  return season.trim().toUpperCase();
}

// 2026 시즌 -> 2025 비교 시즌 (예: F25 -> F24)
function comparableSeason(season: string): string {
  const normalized = normalizeSeason(season);
  const match = normalized.match(/^([FS])(\d{2})$/);
  if (!match) {
    return normalized;
  }
  const prefix = match[1];
  const year = parseInt(match[2], 10);
  const prevYear = (year + 99) % 100; // year - 1
  return `${prefix}${prevYear.toString().padStart(2, "0")}`;
}

// 2025 시즌 -> 2026 타겟 시즌 (예: F24 -> F25)
function getNextSeason(season: string): string {
  const normalized = normalizeSeason(season);
  const match = normalized.match(/^([FS])(\d{2})$/);
  if (!match) {
    return normalized;
  }
  const prefix = match[1];
  const year = parseInt(match[2], 10);
  const nextYear = (year + 1) % 100; // year + 1
  return `${prefix}${nextYear.toString().padStart(2, "0")}`;
}

function buildComparisonKey(date: string, season: string, item: string): string {
  return `${getMonthDay(date)}|${normalizeSeason(season)}|${item}`;
}

function parseNumber(value: string): number {
  const normalized = value.replace(/,/g, "");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadCSV(): Promise<CSVRecord[]> {
  const now = Date.now();
  if (csvCache && now - csvCacheTime < CACHE_TTL) {
    return csvCache;
  }

  try {
    const [response2025, response2026] = await Promise.all([
      fetch("/sales_2025.csv"),
      fetch("/sales_2026.csv"),
    ]);

    if (!response2025.ok) {
      throw new Error(`Failed to load sales_2025.csv: ${response2025.status}`);
    }
    if (!response2026.ok) {
      throw new Error(`Failed to load sales_2026.csv: ${response2026.status}`);
    }

    const [text2025, text2026] = await Promise.all([
      response2025.text(),
      response2026.text(),
    ]);

    const records2025 = parseCSV(text2025) as YearData[];
    const records2026 = parseCSV(text2026) as YearData[];

    // 1. 2025 데이터 미리 합산 (중복 행 제거)
    const map2025 = new Map<string, { revenue: number; COGS: number; Discount: number; season: string; item: string; date: string }>();
    records2025.forEach((row) => {
      const key = buildComparisonKey(row.date, row.Season, row.Item);
      const current = map2025.get(key) ?? { 
        revenue: 0, 
        COGS: 0, 
        Discount: 0, 
        season: row.Season, 
        item: row.Item,
        date: row.date
      };
      current.revenue += parseNumber(row.revenue);
      current.COGS += parseNumber(row.COGS);
      current.Discount += parseNumber(row.Discount);
      map2025.set(key, current);
    });

    const used2025Keys = new Set<string>();

    // 2. 2026 데이터 기준으로 2025 데이터 매칭
    const merged: CSVRecord[] = records2026.map((row2026) => {
      const key = buildComparisonKey(
        row2026.date,
        comparableSeason(row2026.Season),
        row2026.Item
      );
      const row2025 = map2025.get(key);
      if (row2025) {
        used2025Keys.add(key);
      }

      const revenue_2026 = parseNumber(row2026.revenue);
      const COGS_2026 = parseNumber(row2026.COGS);
      const Discount_2026 = parseNumber(row2026.Discount);

      const revenue_2025 = row2025 ? row2025.revenue : 0;
      const COGS_2025 = row2025 ? row2025.COGS : 0;
      const Discount_2025 = row2025 ? row2025.Discount : 0;

      return {
        date: row2026.date || "",
        season: row2026.Season || "",
        season_2025: comparableSeason(row2026.Season || ""),
        item: row2026.Item || "",
        revenue_2026,
        revenue_2025,
        profit_2026: revenue_2026 - COGS_2026 - Discount_2026,
        profit_2025: revenue_2025 - COGS_2025 - Discount_2025,
      };
    });

    // 3. 매칭되지 않은 나머지 2025 데이터 추가 (날짜와 시즌을 2026 기준으로 변환)
    map2025.forEach((value, key) => {
      if (!used2025Keys.has(key)) {
        const revenue_2025 = value.revenue;
        const COGS_2025 = value.COGS;
        const Discount_2025 = value.Discount;

        // 2025 날짜를 2026 날짜로 변환 (필터링 및 정렬을 위해)
        const alignedDate = value.date.replace("2025", "2026");
        // 2025 시즌을 2026 시즌으로 변환 (필터링을 위해)
        const targetSeason = getNextSeason(value.season || "");

        merged.push({
          date: alignedDate,
          season: targetSeason, 
          season_2025: normalizeSeason(value.season || ""),
          item: value.item || "",
          revenue_2026: 0,
          revenue_2025,
          profit_2026: 0,
          profit_2025: revenue_2025 - COGS_2025 - Discount_2025,
        });
      }
    });

    csvCache = merged;
    csvCacheTime = now;
    return csvCache;
  } catch (error) {
    console.error("CSV 로드 실패:", error);
    throw new Error("데이터를 로드할 수 없습니다. sales_2025.csv와 sales_2026.csv 파일을 확인해주세요.");
  }
}
