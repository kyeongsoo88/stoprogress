export type CSVRecord = {
  date: string;
  season: string;
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
const CACHE_TTL = 1000; // 1초 캐시 (개발 중 CSV 수정 시 빠른 반영)

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

function getKey(row: YearData): string {
  return `${row.date}|${row.Season}|${row.Item}`;
}

export async function loadCSV(): Promise<CSVRecord[]> {
  const now = Date.now();
  if (csvCache && now - csvCacheTime < CACHE_TTL) {
    return csvCache;
  }

  // 두 파일을 병렬로 로드
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

  // 2025년 데이터를 키로 맵 생성
  const map2025 = new Map<string, YearData>();
  records2025.forEach((row) => {
    map2025.set(getKey(row), row);
  });

  // 2026년 데이터를 기준으로 병합
  const merged: CSVRecord[] = records2026.map((row2026) => {
    const key = getKey(row2026);
    const row2025 = map2025.get(key);

    const revenue_2026 = parseFloat(row2026.revenue) || 0;
    const COGS_2026 = parseFloat(row2026.COGS) || 0;
    const Discount_2026 = parseFloat(row2026.Discount) || 0;

    const revenue_2025 = row2025 ? parseFloat(row2025.revenue) || 0 : 0;
    const COGS_2025 = row2025 ? parseFloat(row2025.COGS) || 0 : 0;
    const Discount_2025 = row2025 ? parseFloat(row2025.Discount) || 0 : 0;

    return {
      date: row2026.date || "",
      season: row2026.Season || "",
      item: row2026.Item || "",
      revenue_2026,
      revenue_2025,
      profit_2026: revenue_2026 - COGS_2026 - Discount_2026,
      profit_2025: revenue_2025 - COGS_2025 - Discount_2025,
    };
  });

  // 2025년에만 있는 데이터도 추가 (2026년에 없는 경우)
  records2025.forEach((row2025) => {
    const key = getKey(row2025);
    const exists = records2026.some((row2026) => getKey(row2026) === key);
    if (!exists) {
      const revenue_2025 = parseFloat(row2025.revenue) || 0;
      const COGS_2025 = parseFloat(row2025.COGS) || 0;
      const Discount_2025 = parseFloat(row2025.Discount) || 0;

      merged.push({
        date: row2025.date || "",
        season: row2025.Season || "",
        item: row2025.Item || "",
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
}

