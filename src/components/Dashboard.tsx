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
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-30");
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
    return { labels, values2026, values2025, yoy, maxValue, minValue };
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
    const maxValue = Math.max(0, ...values2026, ...values2025);
    const minValue = Math.min(0, ...values2026, ...values2025);
    return { labels, values2026, values2025, yoy, maxValue, minValue };
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


  const totalRevenue2026 = progressData.total_2026;
  const targetRevenue = progressData.season_target_revenue;
  const seasonProgress = progressData.season_progress;

  // 기간매출: 설정한 기간의 2026년 매출 합계 (Item, 기간, Season AND 조건)
  const periodRevenue = useMemo(() => {
    if (!itemFilteredData.length) return 0;
    let sum = 0;
    itemFilteredData.forEach((row) => {
      sum += row.revenue_2026;
    });
    return sum;
  }, [itemFilteredData]);

  // 기간 YoY: 설정한 기간의 2026년 매출 대비 2025년 매출 YoY %
  // dailySeries와 동일한 로직 사용 (날짜별 버킷, 2025는 중복 제거)
  // Item, 기간, Season을 AND 조건으로 적용
  const periodYoY = useMemo(() => {
    if (!itemFilteredData.length) return null;
    const buckets = new Map<string, { value2026: number; value2025: number }>();
    const counted2025 = new Set<string>();
    
    itemFilteredData.forEach((row) => {
      const label = row.date;
      const existing = buckets.get(label) ?? { value2026: 0, value2025: 0 };
      
      // 2026은 모두 합산
      existing.value2026 += row.revenue_2026;
      
      // 2025는 중복 제거 (같은 날짜-시즌-아이템 조합은 한 번만)
      // season_2025를 우선 사용 (csvLoader에서 항상 설정됨)
      const seasonKey = row.season_2025 || row.season;
      const key2025 = `${label}|${seasonKey}|${row.item}`;
      if (!counted2025.has(key2025)) {
        existing.value2025 += row.revenue_2025;
        counted2025.add(key2025);
      }
      
      buckets.set(label, existing);
    });
    
    // 전체 합계 계산
    let sum2026 = 0;
    let sum2025 = 0;
    buckets.forEach((values) => {
      sum2026 += values.value2026;
      sum2025 += values.value2025;
    });
    
    // 디버깅: 콘솔에 출력
    if (startDate === "2026-01-01" && endDate === "2026-01-30") {
      console.log("기간 YoY 계산:", {
        startDate,
        endDate,
        selectedItem,
        season,
        sum2026,
        sum2025,
        yoy: sum2025 > 0 ? ((sum2026 / sum2025) * 100) : null,
        filteredDataCount: itemFilteredData.length,
        bucketCount: buckets.size,
        counted2025Size: counted2025.size,
      });
    }
    
    if (sum2025 === 0) return null;
    return Math.round(((sum2026 / sum2025) * 100) * 10) / 10;
  }, [itemFilteredData, startDate, endDate, selectedItem, season]);

  // 기간 할인율: 1 - (Revenue 합 / MSRP 합) * 100
  // Item, 기간, Season을 AND 조건으로 적용
  // 전년대비: 2026 할인율 - 2025 할인율
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

  // 이번달 예상 매출 (전년 동기 진척률 기반)
  // startDate를 기준으로 해당 월을 판단하여 예측
  const monthForecast = useMemo(() => {
    if (!csvData || !startDate || !endDate) return null;

    // 1. startDate를 기준으로 해당 월 판단
    const startObj = new Date(startDate);
    if (isNaN(startObj.getTime())) return null;

    const year = startObj.getFullYear(); // 2026
    const month = startObj.getMonth(); // 0-indexed
    const endObj = new Date(endDate);
    const endDay = endObj.getDate(); // endDate의 날짜 (예: 28일)

    // 이번달 시작일 (YYYY-MM-01)
    const startOfMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const monthStr = startOfMonth.slice(0, 7); // "2026-02"
    
    // 2025년 동월 정보
    const startOfMonth2025 = `2025-${String(month + 1).padStart(2, "0")}-01`;
    const endOfPeriod2025 = `2025-${String(month + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    const lastDayOf2025 = new Date(2025, month + 1, 0).getDate();
    const endOfMonth2025 = `2025-${String(month + 1).padStart(2, "0")}-${String(lastDayOf2025).padStart(2, "0")}`;

    // 필터링 헬퍼
    const matchesFilters = (row: CSVRecord) => {
      if (selectedItem !== "전체" && row.item !== selectedItem) return false;
      if (season !== "전체" && row.season !== season) return false;
      return true;
    };

    let revenue2026_Current = 0; // 2026년 현재까지 매출 (startDate ~ endDate)
    let revenue2025_SamePeriod = 0; // 2025년 동일 기간 매출 (2월 1일 ~ 2월 endDay일)
    let revenue2025_TotalMonth = 0; // 2025년 해당 월 전체 매출

    // csvData 전체 순회
    csvData.forEach((row) => {
      if (!matchesFilters(row)) return;

      // 2026년 현재까지 매출 (startDate ~ endDate)
      if (row.date >= startDate && row.date <= endDate) {
        revenue2026_Current += row.revenue_2026;
      }

      // 2025년 데이터 계산
      // csvLoader에서 2025 데이터는 2026 날짜로 매핑되어 있음
      // 따라서 2026 날짜 기준으로 2025 매출을 합산
      
      // 2025년 동일 기간 (2월 1일 ~ 2월 endDay일)
      // row.date가 2026-02-01 ~ 2026-02-endDay 범위에 있으면
      if (row.date >= startOfMonth && row.date <= endOfPeriod2025.replace("2025", "2026")) {
        revenue2025_SamePeriod += row.revenue_2025;
      }

      // 2025년 해당 월 전체 매출
      // row.date가 해당 월에 속하는지 확인 (2026-02-XX 형태)
      if (row.date.startsWith(monthStr)) {
        revenue2025_TotalMonth += row.revenue_2025;
      }
    });

    if (revenue2025_TotalMonth === 0) return null;

    const progressRate = revenue2025_SamePeriod / revenue2025_TotalMonth;

    // 진척률이 너무 낮으면(0%) 예측 불가
    if (progressRate <= 0) return null;

    const forecast = revenue2026_Current / progressRate;

    return {
      forecast: Math.round(forecast),
      progressRate: Math.round(progressRate * 1000) / 10, // xx.x%
      currentRevenue: revenue2026_Current
    };
  }, [csvData, startDate, endDate, selectedItem, season]);

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
        <div style={{ display: "grid", gridTemplateColumns: showYoY ? "1fr 1fr" : "1fr", gap: "16px" }}>
        <div className="card" style={{ width: "100%" }}>
            <h3>일별 매출 비교</h3>
          <div style={{ width: "100%", overflow: "hidden" }}>
            <Plot
            data={[
              {
                  x: dailySeries.labels.map(d => d.slice(5)),
                  y: dailySeries.values2026,
                type: "scatter",
                mode: "lines+markers",
                  name: "2026 일별",
                  line: { color: "#4f46e5", width: 3.5, shape: "spline", smoothing: 1.3 },
                  marker: { size: 6, color: "#4f46e5", line: { width: 1.5, color: "#ffffff" } },
                  hovertemplate: "<b>%{x}</b><br>$%{y:,.0f}<extra></extra>",
                  fill: "tozeroy",
                  fillcolor: "rgba(79, 70, 229, 0.08)",
              },
              ...(show2025Line
                ? [
                    {
                        x: dailySeries.labels.map(d => d.slice(5)),
                        y: dailySeries.values2025,
                      type: "scatter",
                      mode: "lines+markers",
                      name: "2025 동일기간",
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
                    text: metric === "revenue" ? "일별 매출 (USD)" : "일별 이익 (USD)",
                    font: { size: 13, color: "#475569", family: "Pretendard" }
                  },
                  tickprefix: "$",
                  tickfont: { size: 11, color: "#64748b", family: "Pretendard" },
                  gridcolor: "#e2e8f0",
                  gridwidth: 1,
                  zeroline: false,
                  side: "left",
                  range: [dailySeries.minValue * 1.1, Math.max(1, dailySeries.maxValue * 1.1)],
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
            <h3>일별 YoY</h3>
            <div style={{ width: "100%", overflow: "hidden" }}>
              <Plot
                data={[
                  {
                    x: dailySeries.labels.map(d => d.slice(5)),
                    y: dailySeries.yoy,
                    type: "scatter",
                    mode: "lines+markers",
                    name: "YoY",
                    line: { color: "#10b981", width: 3.5, shape: "spline", smoothing: 1.3 },
                    marker: { size: 6, color: "#10b981", line: { width: 1.5, color: "#ffffff" } },
                    hovertemplate: "<b>%{x}</b><br>%{y:.1f}%<extra></extra>",
                    fill: "tozeroy",
                    fillcolor: "rgba(16, 185, 129, 0.08)",
                  },
                  {
                    x: dailySeries.labels.map(d => d.slice(5)),
                    y: dailySeries.labels.map(() => baseline),
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
                    range: [yoyMin - yoyPadding, yoyMax + yoyPadding],
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div className="card">
            <h3>Item YoY (일별)</h3>
            <div className="muted">
              선택 Item: {selectedItem === "전체" ? "전체 (모든 아이템 합계)" : selectedItem}
            </div>
            <Plot
              data={[
                {
                  x: itemYoySeries.map((point) => point.x),
                  y: itemYoySeries.map((point) => point.y),
                  type: "scatter",
                  mode: "lines+markers",
                  name: "Item YoY",
                  line: { color: "#f97316", width: 3 },
                  marker: { size: 6 },
                  hovertemplate: "%{x}<br>%{y:.1f}%<extra></extra>",
                },
                {
                  x: itemYoySeries.map((point) => point.x),
                  y: itemYoySeries.map(() => baseline),
                  type: "scatter",
                  mode: "lines",
                  name: "100% 기준선",
                  line: { color: "#94a3b8", width: 2, dash: "dot" },
                  hoverinfo: "skip",
                },
              ]}
              layout={{
                height: 240,
                margin: { l: 50, r: 20, t: 20, b: 40 },
                yaxis: {
                  title: "YoY (%)",
                  range: [selectedYoyMin - selectedYoyPadding, selectedYoyMax + selectedYoyPadding],
                  ticksuffix: "%",
                  tickformat: ".0f",
                  gridcolor: "#e5e7eb",
                },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "#ffffff",
                legend: { orientation: "h" },
                xaxis: {
                  title: "Date",
                  gridcolor: "#f1f5f9",
                  tickangle: -30,
                  automargin: true,
                },
              }}
              config={{ displayModeBar: false, responsive: true }}
            />
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
      </div>
    </section>
  );
}

