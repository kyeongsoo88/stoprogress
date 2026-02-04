"use client";

import { useEffect, useMemo, useState } from "react";
import Plot from "./PlotlyChart";
import { loadCSV, CSVRecord } from "../lib/csvLoader";
import {
  filterData,
  buildTimeseries,
  getItems,
  getProgress,
  getYoY,
  UnitKey,
  MetricKey,
} from "../lib/aggregate";
import { formatCurrency, formatPercent } from "../lib/metrics";

const formatDate = (date: string) => date;

export default function Dashboard() {
  const [csvData, setCsvData] = useState<CSVRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("2026-02-01");
  const [endDate, setEndDate] = useState("2026-02-04");
  const [season, setSeason] = useState("전체");
  const [selectedItem, setSelectedItem] = useState("전체");
  const [unit, setUnit] = useState<UnitKey>("day");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [showYoY, setShowYoY] = useState(true);
  const [show2025Line, setShow2025Line] = useState(true);
  const [showAllItems, setShowAllItems] = useState(false);

  useEffect(() => {
    loadCSV()
      .then((data) => {
        setCsvData(data);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "CSV 로드 실패");
        setLoading(false);
      });
  }, []);

  const seasons = useMemo(() => {
    if (!csvData) return [];
    const unique = new Set<string>();
    csvData.forEach((row) => {
      if (row.season) {
        unique.add(row.season);
      }
    });
    return Array.from(unique).sort();
  }, [csvData]);

  const filteredData = useMemo(() => {
    if (!csvData) return [];
    return filterData(csvData, { start: startDate, end: endDate, season });
  }, [csvData, startDate, endDate, season]);

  const itemFilteredData = useMemo(() => {
    if (!csvData) return [];
    return filterData(csvData, {
      start: startDate,
      end: endDate,
      season,
      item: selectedItem,
    });
  }, [csvData, startDate, endDate, season, selectedItem]);

  const itemTimeseriesData = useMemo(() => {
    if (!itemFilteredData.length) return null;
    return buildTimeseries(itemFilteredData, unit, metric);
  }, [itemFilteredData, unit, metric]);

  const itemsData = useMemo(() => {
    if (!filteredData.length) return [];
    return getItems(filteredData);
  }, [filteredData]);

  const progressData = useMemo(() => {
    if (!filteredData.length)
      return { total_2026: 0, total_2025: 0, season_target_revenue: 0, season_progress: 0 };
    return getProgress(filteredData);
  }, [filteredData]);

  const yoyData = useMemo(() => {
    if (!filteredData.length)
      return {
        baseline: 100,
        yoy_pct: { today: null, week: null, month: null, ytd: null },
        yoy_ratio: { today: null, week: null, month: null, ytd: null },
      };
    return getYoY(filteredData, metric, endDate);
  }, [filteredData, metric, endDate]);

  const baseline = 100;
  const itemYoySeries = useMemo(() => {
    if (!itemTimeseriesData) return [];
    return itemTimeseriesData.series.find((entry) => entry.name === "yoy_pct")?.points ?? [];
  }, [itemTimeseriesData]);

  const dailySeries = useMemo(() => {
    const buckets = new Map<string, { value2026: number; value2025: number }>();
    const counted2025 = new Set<string>();
    itemFilteredData.forEach((row) => {
      const label = row.date;
      const existing = buckets.get(label) ?? { value2026: 0, value2025: 0 };
      if (metric === "profit") {
        existing.value2026 += row.profit_2026;
        const key2025 = `${label}|${row.season_2025 ?? row.season}|${row.item}`;
        if (!counted2025.has(key2025)) {
          existing.value2025 += row.profit_2025;
          counted2025.add(key2025);
        }
      } else {
        existing.value2026 += row.revenue_2026;
        const key2025 = `${label}|${row.season_2025 ?? row.season}|${row.item}`;
        if (!counted2025.has(key2025)) {
          existing.value2025 += row.revenue_2025;
          counted2025.add(key2025);
        }
      }
      buckets.set(label, existing);
    });
    const labels = Array.from(buckets.keys()).sort();
    const values2026 = labels.map((label) => Math.round(buckets.get(label)?.value2026 ?? 0));
    const values2025 = labels.map((label) => Math.round(buckets.get(label)?.value2025 ?? 0));
    const yoy = labels.map((label) => {
      const v2026 = buckets.get(label)?.value2026 ?? 0;
      const v2025 = buckets.get(label)?.value2025 ?? 0;
      return v2025 > 0 ? Math.round((v2026 / v2025) * 1000) / 10 : null;
    });
    const maxValue = Math.max(0, ...values2026, ...values2025);
    const minValue = Math.min(0, ...values2026, ...values2025);

    const forecastValues: Array<number | null> = labels.map(() => null);
    
    let lastIndex2026 = -1;
    for (let i = values2026.length - 1; i >= 0; i--) {
      if (values2026[i] > 0) {
        lastIndex2026 = i;
        break;
      }
    }

    if (lastIndex2026 !== -1 && lastIndex2026 < labels.length - 1) {
      let sum2026 = 0;
      let sum2025 = 0;
      for (let i = 0; i <= lastIndex2026; i++) {
        sum2026 += values2026[i];
        sum2025 += values2025[i];
      }

      const growthRatio = sum2025 > 0 ? sum2026 / sum2025 : 1.0;

      forecastValues[lastIndex2026] = values2026[lastIndex2026];
      
      for (let i = lastIndex2026 + 1; i < labels.length; i++) {
        const forecastedValue = values2025[i] * growthRatio;
        forecastValues[i] = Math.round(forecastedValue);
      }
    }

    return { labels, values2026, values2025, yoy, maxValue, minValue, forecastValues };
  }, [itemFilteredData, metric]);

  const dailyCumulativeSeries = useMemo(() => {
    const labels = dailySeries.labels;
    let acc2026 = 0;
    const values2026 = dailySeries.values2026.map((v) => {
      acc2026 += v;
      return acc2026;
    });
    let acc2025 = 0;
    const values2025 = dailySeries.values2025.map((v) => {
      acc2025 += v;
      return acc2025;
    });
    const yoy = labels.map((_, i) => {
      const v2026 = values2026[i];
      const v2025 = values2025[i];
      return v2025 > 0 ? Math.round((v2026 / v2025) * 1000) / 10 : null;
    });

    const forecastCumValues: Array<number | null> = labels.map(() => null);
    
    let forecastStartIndex = -1;

    if (dailySeries.forecastValues) {
        let currentCum = 0;
        let hasStartedForecast = false;

        for (let i = 0; i < labels.length; i++) {
            if (dailySeries.forecastValues[i] === null) {
                currentCum = values2026[i];
                forecastCumValues[i] = null; 
            } else {
                if (!hasStartedForecast) {
                    currentCum = values2026[i];
                    forecastCumValues[i] = currentCum;
                    hasStartedForecast = true;
                } else {
                    currentCum += dailySeries.forecastValues[i]!;
                    forecastCumValues[i] = Math.round(currentCum);
                }
            }
        }
    }

    const maxValue = Math.max(0, ...values2026, ...values2025, ...(forecastCumValues.filter(v => v !== null) as number[]));
    const minValue = Math.min(0, ...values2026, ...values2025);
    return { labels, values2026, values2025, yoy, maxValue, minValue, forecastCumValues };
  }, [dailySeries]);

  const ytdYoyValues = useMemo(
    () => dailyCumulativeSeries.yoy.filter((value): value is number => typeof value === "number"),
    [dailyCumulativeSeries.yoy]
  );
  const ytdYoyMin = useMemo(() => {
    if (ytdYoyValues.length === 0) return baseline;
    return Math.min(baseline, ytdYoyValues.reduce((min, val) => Math.min(min, val), ytdYoyValues[0]));
  }, [ytdYoyValues, baseline]);
  const ytdYoyMax = useMemo(() => {
    if (ytdYoyValues.length === 0) return baseline;
    return Math.max(baseline, ytdYoyValues.reduce((max, val) => Math.max(max, val), ytdYoyValues[0]));
  }, [ytdYoyValues, baseline]);
  const ytdYoyPadding = useMemo(() => Math.max(6, (ytdYoyMax - ytdYoyMin) * 0.2), [ytdYoyMax, ytdYoyMin]);

  // 트리맵용 데이터: Season 필터와 상관없이 날짜로만 필터링된 전체 데이터 필요
  const dateFilteredData = useMemo(() => {
    if (!csvData) return [];
    return filterData(csvData, { start: startDate, end: endDate, season: "전체" });
  }, [csvData, startDate, endDate]);

  // 2026년 실적 데이터가 있는 마지막 날짜 찾기 (전체 데이터 기준)
  const globalLastValidDate = useMemo(() => {
    if (!dateFilteredData.length) return null;
    let lastDate = "";
    dateFilteredData.forEach((row) => {
      if (row.revenue_2026 !== 0) {
        if (row.date > lastDate) {
          lastDate = row.date;
        }
      }
    });
    return lastDate;
  }, [dateFilteredData]);

  // 트리맵용 데이터: 실적 데이터가 있는 날짜까지만 포함 (Period Align)
  const treemapSourceData = useMemo(() => {
    if (!dateFilteredData.length) return [];
    if (!globalLastValidDate) return dateFilteredData; // 데이터 없으면 전체 사용
    
    return dateFilteredData.filter(row => row.date <= globalLastValidDate);
  }, [dateFilteredData, globalLastValidDate]);

  // 계층형 트리맵 데이터 집계 (Season -> Item)
  const hierarchicalTreemapData = useMemo(() => {
    if (!treemapSourceData.length) return null;

    // 1. 데이터 집계
    const seasonStats = new Map<
      string,
      {
        revenue2026: number; // 실제 매출 (텍스트 표시용)
        revenue2025: number;
        msrp2026: number;
        msrp2025: number;
        items: Map<string, number>; // Item별 Revenue (양수만)
        visualRevenue: number; // 시각화용 매출 (양수 아이템 합계)
      }
    >();

    treemapSourceData.forEach((row) => {
      const seasonKey = row.season || "Unknown";
      const itemKey = row.item || "Unknown";

      const seasonData = seasonStats.get(seasonKey) ?? {
        revenue2026: 0,
        revenue2025: 0,
        msrp2026: 0,
        msrp2025: 0,
        items: new Map<string, number>(),
        visualRevenue: 0,
      };

      // 텍스트 표시용 실제 매출 합산 (반품 포함)
      seasonData.revenue2026 += row.revenue_2026;
      seasonData.revenue2025 += row.revenue_2025;
      seasonData.msrp2026 += row.msrp_2026;
      seasonData.msrp2025 += row.msrp_2025;

      // Item별 매출 집계 (양수만 필터링하기 위해 일단 다 더함)
      const currentItemRevenue = seasonData.items.get(itemKey) ?? 0;
      seasonData.items.set(itemKey, currentItemRevenue + row.revenue_2026);

      seasonStats.set(seasonKey, seasonData);
    });

    // 2. 시각화용 데이터 정제 (음수 매출 제거 및 부모 값 재계산)
    seasonStats.forEach((data, seasonKey) => {
        let visualTotal = 0;
        data.items.forEach((rev, key) => {
            if (rev > 0) {
                visualTotal += rev;
            }
        });
        data.visualRevenue = visualTotal;
    });

    // 3. Plotly 트리맵 데이터 구조 생성 (All 노드 제거)
    const ids: string[] = [];
    const labels: string[] = [];
    const parents: string[] = [];
    const values: number[] = [];
    const texts: string[] = [];
    const colors: string[] = [];

    // 정렬 (시각화용 매출액 내림차순)
    const sortedSeasons = Array.from(seasonStats.entries()).sort(
      (a, b) => b[1].visualRevenue - a[1].visualRevenue
    );

    // 파스텔톤 컬러풀 팔레트
    const palette = [
      "#93c5fd", // blue-300
      "#86efac", // green-300
      "#fca5a5", // red-300
      "#fcd34d", // amber-300
      "#c4b5fd", // violet-300
      "#fda4af", // rose-300
      "#67e8f9", // cyan-300
      "#fdba74", // orange-300
    ];

    sortedSeasons.forEach(([season, data], index) => {
      if (data.visualRevenue <= 0) return;

      // 2.1 Season 노드 (Parent)
      const seasonColor = palette[index % palette.length];
      // 비중 계산: 전체 시각화 매출 대비 해당 시즌 시각화 매출
      // Total visual revenue calculation for share
      const totalVisual = sortedSeasons.reduce((sum, [_, d]) => sum + d.visualRevenue, 0);
      const share = (data.visualRevenue / totalVisual) * 100;
      
      const discountRate2026 =
        data.msrp2026 > 0 ? (1 - data.revenue2026 / data.msrp2026) * 100 : 0;
      const discountRate2025 =
        data.msrp2025 > 0 ? (1 - data.revenue2025 / data.msrp2025) * 100 : 0;
      const yoy =
        data.revenue2025 > 0 ? (data.revenue2026 / data.revenue2025) * 100 : null;

      ids.push(season);
      labels.push(season);
      parents.push(""); // 최상위 (부모 없음)
      values.push(data.visualRevenue); // 시각화용 값 사용
      colors.push(seasonColor);

      // Season 텍스트
      const formattedRevenue = formatCurrency(data.revenue2026).replace("$", "$");
      let text = `${formattedRevenue} (${share.toFixed(1)}%)<br>`;
      text += `할인율: ${discountRate2026.toFixed(1)}%<br>`;
      text += `전년할인율: ${discountRate2025.toFixed(1)}%<br>`;
      text += `YOY: ${yoy !== null ? Math.round(yoy) + "%" : "N/A"}`;
      texts.push(text);

      // 2.2 Item 노드 (Children)
      const sortedItems = Array.from(data.items.entries())
        .filter(([_, rev]) => rev > 0) // 양수만 필터링
        .sort((a, b) => b[1] - a[1]);

      sortedItems.forEach(([item, itemRevenue]) => {
        const itemId = `${season}-${item}`; // 고유 ID
        const itemShare = (itemRevenue / data.visualRevenue) * 100; // 시즌 내 비중

        ids.push(itemId);
        labels.push(item);
        parents.push(season); // 부모는 해당 Season
        values.push(itemRevenue);
        colors.push(seasonColor); // 부모 색상 상속

        // Item 텍스트
        const itemFormattedRevenue = formatCurrency(itemRevenue).replace("$", "$");
        let itemText = `${itemFormattedRevenue} (${itemShare.toFixed(1)}%)`;
        texts.push(itemText);
      });
    });

    return { ids, labels, parents, values, texts, colors };
  }, [treemapSourceData]);

  // Item별 트리맵 데이터 집계
  const itemTreemapData = useMemo(() => {
    if (!treemapSourceData.length) return null;

    const buckets = new Map<
      string,
      {
        revenue2026: number;
        revenue2025: number;
        msrp2026: number;
        msrp2025: number;
        count: number;
      }
    >();

    let totalRevenue2026 = 0;

    treemapSourceData.forEach((row) => {
      const itemKey = row.item || "Unknown";
      const existing = buckets.get(itemKey) ?? {
        revenue2026: 0,
        revenue2025: 0,
        msrp2026: 0,
        msrp2025: 0,
        count: 0,
      };

      existing.revenue2026 += row.revenue_2026;
      existing.revenue2025 += row.revenue_2025;
      existing.msrp2026 += row.msrp_2026;
      existing.msrp2025 += row.msrp_2025;
      existing.count += 1;

      buckets.set(itemKey, existing);
      totalRevenue2026 += row.revenue_2026;
    });

    const labels: string[] = [];
    const parents: string[] = [];
    const values: number[] = [];
    const texts: string[] = [];
    const colors: string[] = [];

    const sortedItems = Array.from(buckets.entries()).sort(
      (a, b) => b[1].revenue2026 - a[1].revenue2026
    );

    // 파스텔톤 컬러풀 팔레트
    const palette = [
      "#93c5fd", // blue-300
      "#86efac", // green-300
      "#fca5a5", // red-300
      "#fcd34d", // amber-300
      "#c4b5fd", // violet-300
      "#fda4af", // rose-300
      "#67e8f9", // cyan-300
      "#fdba74", // orange-300
    ];

    sortedItems.forEach(([item, data], index) => {
      if (data.revenue2026 <= 0) return;

      const share = (data.revenue2026 / totalRevenue2026) * 100;
      const discountRate2026 =
        data.msrp2026 > 0 ? (1 - data.revenue2026 / data.msrp2026) * 100 : 0;
      const discountRate2025 =
        data.msrp2025 > 0 ? (1 - data.revenue2025 / data.msrp2025) * 100 : 0;
      const yoy =
        data.revenue2025 > 0 ? (data.revenue2026 / data.revenue2025) * 100 : null;

      labels.push(item);
      parents.push("");
      values.push(data.revenue2026);

      const formattedRevenue = formatCurrency(data.revenue2026).replace("$", "$");
      
      let text = `<b>${item}</b><br>`;
      text += `${formattedRevenue} (${share.toFixed(1)}%)<br>`;
      text += `할인율: ${discountRate2026.toFixed(1)}%<br>`;
      text += `전년할인율: ${discountRate2025.toFixed(1)}%<br>`;
      text += `YOY: ${yoy !== null ? Math.round(yoy) + "%" : "N/A"}`;

      texts.push(text);
      colors.push(palette[index % palette.length]);
    });

    return { labels, parents, values, texts, colors };
  }, [treemapSourceData]);


  const totalRevenue2026 = progressData.total_2026;
  const targetRevenue = progressData.season_target_revenue;
  const seasonProgress = progressData.season_progress;

  const periodRevenue = useMemo(() => {
    if (!itemFilteredData.length) return 0;
    let sum = 0;
    itemFilteredData.forEach((row) => {
      sum += row.revenue_2026;
    });
    return sum;
  }, [itemFilteredData]);

  const periodYoY = useMemo(() => {
    if (!itemFilteredData.length) return null;
    let lastValidDate = "";
    itemFilteredData.forEach((row) => {
      if (row.revenue_2026 !== 0) {
        if (row.date > lastValidDate) {
          lastValidDate = row.date;
        }
      }
    });

    if (!lastValidDate) return null;

    const buckets = new Map<string, { value2026: number; value2025: number }>();
    const counted2025 = new Set<string>();

    itemFilteredData.forEach((row) => {
      if (row.date > lastValidDate) return;

      const label = row.date;
      const existing = buckets.get(label) ?? { value2026: 0, value2025: 0 };

      existing.value2026 += row.revenue_2026;

      const seasonKey = row.season_2025 || row.season;
      const key2025 = `${label}|${seasonKey}|${row.item}`;
      if (!counted2025.has(key2025)) {
        existing.value2025 += row.revenue_2025;
        counted2025.add(key2025);
      }

      buckets.set(label, existing);
    });

    let sum2026 = 0;
    let sum2025 = 0;
    buckets.forEach((values) => {
      sum2026 += values.value2026;
      sum2025 += values.value2025;
    });

    if (sum2025 === 0) return null;
    return Math.round(((sum2026 / sum2025) * 100) * 10) / 10;
  }, [itemFilteredData, startDate, endDate, selectedItem, season]);

  const periodDiscountRate = useMemo(() => {
    if (!itemFilteredData.length) return null;
    let sumRevenue2026 = 0;
    let sumMSRP2026 = 0;
    let sumRevenue2025 = 0;
    let sumMSRP2025 = 0;
    
    itemFilteredData.forEach((row) => {
      sumRevenue2026 += row.revenue_2026;
      sumMSRP2026 += row.msrp_2026;
      sumRevenue2025 += row.revenue_2025;
      sumMSRP2025 += row.msrp_2025;
    });
    
    if (sumMSRP2026 === 0) return null;
    const discountRate2026 = (1 - sumRevenue2026 / sumMSRP2026) * 100;
    
    let discountRate2025: number | null = null;
    if (sumMSRP2025 > 0) {
      discountRate2025 = (1 - sumRevenue2025 / sumMSRP2025) * 100;
    }
    
    const yearOverYear = discountRate2025 !== null 
      ? discountRate2026 - discountRate2025 
      : null;
    
    return {
      rate2026: Math.round(discountRate2026 * 10) / 10,
      rate2025: discountRate2025 !== null ? Math.round(discountRate2025 * 10) / 10 : null,
      yearOverYear: yearOverYear !== null ? Math.round(yearOverYear * 10) / 10 : null,
    };
  }, [itemFilteredData]);

  const monthForecast = useMemo(() => {
    if (!csvData) return null;

    const startObj = new Date(startDate);
    const year = startObj.getFullYear();
    const month = startObj.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`; 
    
    let lastDateInMonth = "";
    csvData.forEach(row => {
      if (row.date.startsWith(monthStr)) {
        if (row.revenue_2026 !== 0) {
          if (row.date > lastDateInMonth) {
            lastDateInMonth = row.date;
          }
        }
      }
    });

    if (!lastDateInMonth) {
        return null;
    }

    const targetDateStr = lastDateInMonth;
    const startOfMonth = `${monthStr}-01`;

    const matchesFilters = (row: CSVRecord) => {
      if (selectedItem !== "전체" && row.item !== selectedItem) return false;
      if (season !== "전체" && row.season !== season) return false;
      return true;
    };

    let revenue2026_Current = 0;
    let revenue2025_SamePeriod = 0;
    let revenue2025_TotalMonth = 0;

    csvData.forEach((row) => {
      if (!matchesFilters(row)) return;

      if (row.date >= startOfMonth && row.date <= targetDateStr) {
        revenue2026_Current += row.revenue_2026;
        revenue2025_SamePeriod += row.revenue_2025;
      }

      if (row.date.startsWith(monthStr)) {
        revenue2025_TotalMonth += row.revenue_2025;
      }
    });

    if (revenue2025_TotalMonth === 0) return null;

    const progressRate = revenue2025_SamePeriod / revenue2025_TotalMonth;

    if (progressRate <= 0) return null;

    const forecast = revenue2026_Current / progressRate;

    return {
      forecast: Math.round(forecast),
      progressRate: Math.round(progressRate * 1000) / 10, 
      currentRevenue: revenue2026_Current
    };
  }, [csvData, startDate, selectedItem, season]);

  const itemsForTable = useMemo(
    () =>
      itemsData
        .slice()
        .sort((a, b) => b.revenue_2026 - a.revenue_2026)
        .map((item) => ({
    item: item.item,
    revenue2026: item.revenue_2026,
    revenue2025: item.revenue_2025,
    yoy: item.yoy,
    progress: item.progress,
        })),
    [itemsData]
  );
  const itemRows = showAllItems ? itemsForTable : itemsForTable.slice(0, 6);

  const selectedYoYValues = useMemo(() => 
    itemYoySeries
      .map((point) => point.y)
      .filter((value): value is number => typeof value === "number"),
    [itemYoySeries]
  );
  const selectedYoyMin = useMemo(() => {
    if (selectedYoYValues.length === 0) return baseline;
    return Math.min(baseline, selectedYoYValues.reduce((min, val) => Math.min(min, val), selectedYoYValues[0]));
  }, [selectedYoYValues, baseline]);
  const selectedYoyMax = useMemo(() => {
    if (selectedYoYValues.length === 0) return baseline;
    return Math.max(baseline, selectedYoYValues.reduce((max, val) => Math.max(max, val), selectedYoYValues[0]));
  }, [selectedYoYValues, baseline]);
  const selectedYoyPadding = useMemo(() => Math.max(6, (selectedYoyMax - selectedYoyMin) * 0.2), [selectedYoyMax, selectedYoyMin]);

  const yoyValues = useMemo(
    () => dailySeries.yoy.filter((value): value is number => typeof value === "number"),
    [dailySeries.yoy]
  );
  const yoyMin = useMemo(() => {
    if (yoyValues.length === 0) return baseline;
    return Math.min(baseline, yoyValues.reduce((min, val) => Math.min(min, val), yoyValues[0]));
  }, [yoyValues, baseline]);
  const yoyMax = useMemo(() => {
    if (yoyValues.length === 0) return baseline;
    return Math.max(baseline, yoyValues.reduce((max, val) => Math.max(max, val), yoyValues[0]));
  }, [yoyValues, baseline]);
  const yoyPadding = useMemo(() => Math.max(6, (yoyMax - yoyMin) * 0.2), [yoyMax, yoyMin]);

  if (loading) {
    return (
      <section className="chart-stack">
        <div className="card">
          <div style={{ padding: "40px", textAlign: "center" }}>
            <div className="muted">CSV 파일을 로딩 중입니다...</div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="chart-stack">
        <div className="card">
          <div style={{ padding: "40px", textAlign: "center" }}>
            <div style={{ color: "#ef4444", marginBottom: "8px" }}>CSV 로드 실패</div>
            <div className="muted">{error}</div>
            <div className="muted" style={{ marginTop: "16px", fontSize: "14px" }}>
              public/sales_2025.csv와 public/sales_2026.csv 파일이 존재하는지 확인해주세요.
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!csvData || csvData.length === 0) {
    return (
      <section className="chart-stack">
        <div className="card">
          <div style={{ padding: "40px", textAlign: "center" }}>
            <div className="muted">CSV 데이터가 없습니다.</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="chart-stack">
      <div className="card">
        <div className="filter-bar">
          <div>
            <label>기간(2026)</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div>
            <label>~</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div>
            <label>Season</label>
            <select value={season} onChange={(event) => setSeason(event.target.value)}>
              <option value="전체">전체</option>
              {seasons.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Item</label>
            <select value={selectedItem} onChange={(event) => setSelectedItem(event.target.value)}>
              <option value="전체">전체</option>
              {itemsForTable.map((item) => (
                <option key={item.item} value={item.item}>
                  {item.item}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }} className="toggle-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showYoY}
              onChange={(event) => setShowYoY(event.target.checked)}
            />
            YoY 표시
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={show2025Line}
              onChange={(event) => setShow2025Line(event.target.checked)}
            />
            2025 비교선
          </label>
          <span className="chip">Season: {season}</span>
          {loading && <span className="status-badge loading">CSV 로딩중...</span>}
          {error && <span className="status-badge error">CSV 오류: {error}</span>}
          {!loading && !error && csvData && (
            <span className="status-badge ok">CSV 로드 완료 ({csvData.length}건)</span>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card">
          <div className="muted">기간매출</div>
          <div className="kpi-value">{formatCurrency(periodRevenue)}</div>
          <div className="muted">{startDate} ~ {endDate}</div>
        </div>
        <div className="card">
          <div className="muted">기간 YoY</div>
          <div className="kpi-value">{periodYoY !== null ? formatPercent(periodYoY) : "N/A"}</div>
          <div className="muted">{startDate} ~ {endDate}</div>
        </div>
        <div className="card">
          <div className="muted">기간 할인율</div>
          <div className="kpi-value">
            {periodDiscountRate !== null ? (
              <>
                {formatPercent(periodDiscountRate.rate2026)}
                {periodDiscountRate.yearOverYear !== null && (
                  <span style={{ fontSize: "0.7em", color: "#6b7280", marginLeft: "8px" }}>
                    (전년대비: {periodDiscountRate.yearOverYear >= 0 ? "+" : ""}{formatPercent(periodDiscountRate.yearOverYear)})
                  </span>
                )}
              </>
            ) : (
              "N/A"
            )}
          </div>
          <div className="muted">{startDate} ~ {endDate}</div>
        </div>
        <div className="card">
          <div className="muted">이번달 예상 매출</div>
          <div className="kpi-value">
            {monthForecast !== null ? formatCurrency(monthForecast.forecast) : "N/A"}
          </div>
          <div className="muted">
            {monthForecast !== null 
              ? `진척률: ${monthForecast.progressRate}% (전년 동기 패턴)` 
              : "데이터 부족"}
          </div>
        </div>
      </div>

      <div className="chart-stack">
        {hierarchicalTreemapData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="card">
              <h3>Season별 매출 구성</h3>
              <div style={{ width: "100%", height: "400px" }}>
                <Plot
                  data={[
                    {
                      type: "treemap",
                      ids: hierarchicalTreemapData.ids, // 추가된 ID
                      labels: hierarchicalTreemapData.labels,
                      parents: hierarchicalTreemapData.parents,
                      values: hierarchicalTreemapData.values,
                      text: hierarchicalTreemapData.texts,
                      textinfo: "label+text", // 이름 + 커스텀 텍스트(액수 등) 표시
                      hoverinfo: "label+text+percent parent", // 호버 시 value(시각화용 값) 대신 text(실제 값) 표시
                      branchvalues: "total", // 부모 값 = 자식 값 합계 (중요)
                      marker: {
                          colors: hierarchicalTreemapData.colors,
                          showscale: false
                      },
                      textposition: "middle center",
                      textfont: {
                          size: 14,
                          color: "#1e293b"
                      },
                      // @ts-ignore
                      tiling: { packing: "squarify" }, // 레이아웃 최적화
                      maxdepth: 1, // 1단계(Season)만 표시, 클릭 시 하위 단계(Item) 표시
                    },
                  ]}
                  layout={{
                    margin: { l: 10, r: 10, t: 10, b: 10 },
                    paper_bgcolor: "rgba(0,0,0,0)",
                    plot_bgcolor: "rgba(0,0,0,0)",
                    autosize: true,
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
            {itemTreemapData && (
              <div className="card">
                <h3>Item별 매출 구성</h3>
                <div style={{ width: "100%", height: "400px" }}>
                  <Plot
                    data={[
                      {
                        type: "treemap",
                        labels: itemTreemapData.labels,
                        parents: itemTreemapData.parents,
                        values: itemTreemapData.values,
                        text: itemTreemapData.texts,
                        textinfo: "text",
                        hoverinfo: "label+value+percent parent",
                        marker: {
                            colors: itemTreemapData.colors,
                            showscale: false
                        },
                        textposition: "middle center",
                        textfont: {
                            size: 14,
                            color: "#1e293b"
                        }
                      },
                    ]}
                    layout={{
                      margin: { l: 10, r: 10, t: 10, b: 10 },
                      paper_bgcolor: "rgba(0,0,0,0)",
                      plot_bgcolor: "rgba(0,0,0,0)",
                      autosize: true,
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: showYoY ? "1fr 1fr" : "1fr", gap: "16px", marginTop: "16px" }}>
          <div className="card" style={{ width: "100%" }}>
            <h3>{metric === "revenue" ? "일별 매출 YTD" : "일별 이익 YTD"}</h3>
            <div style={{ width: "100%", overflow: "hidden" }}>
              <Plot
                data={[
                  {
                    x: dailyCumulativeSeries.labels.map((d) => d.slice(5)),
                    y: dailyCumulativeSeries.values2026,
                    type: "scatter",
                    mode: "lines+markers",
                    name: "2026 누적",
                    line: { color: "#4f46e5", width: 3.5, shape: "spline", smoothing: 1.3 },
                    marker: { size: 6, color: "#4f46e5", line: { width: 1.5, color: "#ffffff" } },
                    hovertemplate: "<b>%{x}</b><br>$%{y:,.0f}<extra></extra>",
                  fill: "tozeroy",
                  fillcolor: "rgba(79, 70, 229, 0.08)",
              },
              {
                x: dailyCumulativeSeries.labels.map(d => d.slice(5)),
                y: dailyCumulativeSeries.forecastCumValues,
                type: "scatter",
                mode: "lines",
                name: "2026 누적 예상",
                line: { color: "#a855f7", width: 2.5, dash: "dot", shape: "spline", smoothing: 1.3 },
                hoverinfo: "skip",
                connectgaps: true,
              },
              ...(show2025Line
                    ? [
                        {
                          x: dailyCumulativeSeries.labels.map((d) => d.slice(5)),
                          y: dailyCumulativeSeries.values2025,
                          type: "scatter",
                          mode: "lines+markers",
                          name: "2025 누적",
                          line: { color: "#f59e0b", width: 3, shape: "spline", smoothing: 1.3 },
                          marker: { size: 5, color: "#f59e0b", line: { width: 1.5, color: "#ffffff" } },
                          hovertemplate: "<b>%{x}</b><br>$%{y:,.0f}<extra></extra>",
                        },
                      ]
                    : []),
                ]}
                layout={{
                  height: 350,
                  margin: { l: 70, r: 80, t: 30, b: 50 },
                  legend: { 
                    orientation: "h", 
                    y: -0.18,
                    x: 0.5,
                    xanchor: "center",
                    font: { size: 13, family: "Pretendard" },
                    bgcolor: "rgba(255,255,255,0.8)",
                    bordercolor: "rgba(226,232,240,0.5)",
                    borderwidth: 1,
                  },
                  paper_bgcolor: "rgba(0,0,0,0)",
                  plot_bgcolor: "#fafbfc",
                  autosize: true,
                  font: { family: "Pretendard", size: 12, color: "#334155" },
                  yaxis: {
                    title: { 
                      text: metric === "revenue" ? "누적 매출 (USD)" : "누적 이익 (USD)",
                      font: { size: 13, color: "#475569", family: "Pretendard" }
                    },
                    tickprefix: "$",
                    tickfont: { size: 11, color: "#64748b", family: "Pretendard" },
                    gridcolor: "#e2e8f0",
                    gridwidth: 1,
                    zeroline: false,
                    side: "left",
                    range: [dailyCumulativeSeries.minValue * 1.1, Math.max(1, dailyCumulativeSeries.maxValue * 1.1)],
                  },
                  xaxis: { 
                    gridcolor: "#f1f5f9",
                    gridwidth: 1,
                    type: "category",
                    tickfont: { size: 11, color: "#64748b", family: "Pretendard" },
                    title: { text: "날짜", font: { size: 13, color: "#475569", family: "Pretendard" } },
                  },
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
          {showYoY && (
            <div className="card" style={{ width: "100%" }}>
              <h3>YTD YoY</h3>
              <div style={{ width: "100%", overflow: "hidden" }}>
                <Plot
                  data={[
                    {
                      x: dailyCumulativeSeries.labels.map((d) => d.slice(5)),
                      y: dailyCumulativeSeries.yoy,
                      type: "scatter",
                      mode: "lines+markers",
                      name: "YTD YoY",
                      line: { color: "#10b981", width: 3.5, shape: "spline", smoothing: 1.3 },
                      marker: { size: 6, color: "#10b981", line: { width: 1.5, color: "#ffffff" } },
                      hovertemplate: "<b>%{x}</b><br>%{y:.1f}%<extra></extra>",
                      fill: "tozeroy",
                      fillcolor: "rgba(16, 185, 129, 0.08)",
                    },
                    // YTD YoY 예상 라인 추가
                    {
                      x: dailyCumulativeSeries.labels.map(d => d.slice(5)),
                      y: dailyCumulativeSeries.forecastCumValues.map((v, i) => {
                        if (v === null || dailyCumulativeSeries.values2025[i] === 0) return null;
                        // forecastCumValues는 예상 누적 매출
                        // 이를 해당 시점의 2025 누적 매출로 나누어 YoY 계산
                        return Math.round((v / dailyCumulativeSeries.values2025[i]) * 1000) / 10;
                      }),
                      type: "scatter",
                      mode: "lines",
                      name: "예상 YoY",
                      line: { color: "#a855f7", width: 2, dash: "dot" },
                      hoverinfo: "skip",
                      connectgaps: true,
                    },
                    {
                      x: dailyCumulativeSeries.labels.map((d) => d.slice(5)),
                      y: dailyCumulativeSeries.labels.map(() => baseline),
                      type: "scatter",
                      mode: "lines",
                      name: "100% 기준선",
                      line: { color: "#94a3b8", width: 2.5, dash: "dash" },
                      hoverinfo: "skip",
                    },
            ]}
            layout={{
                    height: 350,
                    margin: { l: 70, r: 40, t: 30, b: 50 },
                    legend: { 
                      orientation: "h", 
                      y: -0.2,
                      x: 0.5,
                      xanchor: "center",
                      font: { size: 13, family: "Pretendard" },
                      bgcolor: "rgba(255,255,255,0.8)",
                      bordercolor: "rgba(226,232,240,0.5)",
                      borderwidth: 1,
                    },
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "#fafbfc",
              autosize: true,
              font: { family: "Pretendard", size: 12, color: "#334155" },
              yaxis: {
                title: { 
                  text: "YoY (%)",
                  font: { size: 13, color: "#475569", family: "Pretendard" }
                },
                ticksuffix: "%",
                      tickfont: { size: 11, color: "#64748b", family: "Pretendard" },
                      range: [ytdYoyMin - ytdYoyPadding, ytdYoyMax + ytdYoyPadding],
                      gridcolor: "#e2e8f0",
                      gridwidth: 1,
                      zeroline: true,
                      zerolinecolor: "#94a3b8",
                      zerolinewidth: 2.5,
                    },
                    xaxis: { 
                      title: { text: "날짜", font: { size: 13, color: "#475569", family: "Pretendard" } },
                      gridcolor: "#f1f5f9",
                      gridwidth: 1,
                      type: "category",
                      tickfont: { size: 11, color: "#64748b", family: "Pretendard" },
                    },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%", height: "100%" }}
          />
          </div>
            <p className="muted" style={{ marginTop: 8 }}>
              100% = 전년 동일, 100% 초과 = 성장, 100% 미만 = 감소
            </p>
            </div>
          )}
        </div>

        <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ marginBottom: 0 }}>Item 성과 테이블</h3>
              <button
                type="button"
                className="chip"
                onClick={() => setShowAllItems((prev) => !prev)}
              >
                {showAllItems ? "접기" : "열기"}
              </button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>2026 매출</th>
                  <th>2025 매출</th>
                  <th>YoY</th>
                  <th>진척율</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((row) => (
                  <tr
                    key={row.item}
                    onClick={() => setSelectedItem(row.item)}
                    style={{
                      cursor: "pointer",
                      background:
                        selectedItem === row.item ? "rgba(37, 99, 235, 0.08)" : undefined,
                    }}
                  >
                    <td>{row.item}</td>
                    <td>{formatCurrency(row.revenue2026)}</td>
                    <td>{formatCurrency(row.revenue2025)}</td>
                    <td>{formatPercent(row.yoy)}</td>
                    <td>{formatPercent(row.progress)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>
    </section>
  );
}
