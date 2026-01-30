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

const seasons = ["2026 S/S", "2026 F/W"];

const formatDate = (date: string) => date;

export default function Dashboard() {
  const [csvData, setCsvData] = useState<CSVRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-31");
  const [season, setSeason] = useState("전체");
  const [selectedItem, setSelectedItem] = useState("전체");
  const [unit, setUnit] = useState<UnitKey>("day");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [showYoY, setShowYoY] = useState(true);
  const [show2025Line, setShow2025Line] = useState(true);

  useEffect(() => {
    loadCSV()
      .then((data) => {
        setCsvData(data);
        setLoading(false);
        setError(null);
        if (data.length > 0) {
          const lastDate = data[data.length - 1].date;
          setEndDate(lastDate);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "CSV 로드 실패");
        setLoading(false);
      });
  }, []);

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

  const timeseriesData = useMemo(() => {
    if (!filteredData.length) return null;
    return buildTimeseries(filteredData, unit, metric);
  }, [filteredData, unit, metric]);

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

  const getSeriesPoints = (series: typeof timeseriesData, name: string) => {
    if (!series) return [];
    return series.series.find((entry) => entry.name === name)?.points ?? [];
  };

  const cum2026Name = `cum_${metric}_2026`;
  const cum2025Name = `cum_${metric}_2025_aligned`;
  const baseline = 100;

  const cum2026Points = getSeriesPoints(timeseriesData, cum2026Name);
  const cum2025Points = getSeriesPoints(timeseriesData, cum2025Name);
  const yoySeries = getSeriesPoints(timeseriesData, "yoy_pct");
  const itemYoySeries = getSeriesPoints(itemTimeseriesData, "yoy_pct");

  const totalRevenue2026 = progressData.total_2026;
  const targetRevenue = progressData.season_target_revenue;
  const seasonProgress = progressData.season_progress;

  const todayYoY = yoyData.yoy_pct.today ?? 0;
  const weekYoY = yoyData.yoy_pct.week ?? 0;
  const monthYoY = yoyData.yoy_pct.month ?? 0;
  const ytdYoY = yoyData.yoy_pct.ytd ?? 0;

  const itemsForTable = itemsData.map((item) => ({
    item: item.item,
    revenue2026: item.revenue_2026,
    revenue2025: item.revenue_2025,
    yoy: item.yoy,
    progress: item.progress,
  }));
  const itemRows = itemsForTable;

  const selectedYoYValues = itemYoySeries
    .map((point) => point.y)
    .filter((value): value is number => typeof value === "number");
  const selectedYoyMin = Math.min(
    baseline,
    ...(selectedYoYValues.length ? selectedYoYValues : [baseline])
  );
  const selectedYoyMax = Math.max(
    baseline,
    ...(selectedYoYValues.length ? selectedYoYValues : [baseline])
  );
  const selectedYoyPadding = Math.max(6, (selectedYoyMax - selectedYoyMin) * 0.2);

  const yoyValues = yoySeries
    .map((point) => point.y)
    .filter((value): value is number => typeof value === "number");
  const yoyMin = Math.min(baseline, ...(yoyValues.length ? yoyValues : [baseline]));
  const yoyMax = Math.max(baseline, ...(yoyValues.length ? yoyValues : [baseline]));
  const yoyPadding = Math.max(6, (yoyMax - yoyMin) * 0.2);

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
              public/sales.csv 파일이 존재하는지 확인해주세요.
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
          <div>
            <label>집계 단위</label>
            <select value={unit} onChange={(event) => setUnit(event.target.value as UnitKey)}>
              <option value="day">Day</option>
              <option value="week_fixed_7d">Week (fixed_7d)</option>
              <option value="week_iso">Week (ISO)</option>
              <option value="month">Month</option>
            </select>
          </div>
          <div>
            <label>지표</label>
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as MetricKey)}
            >
              <option value="revenue">Revenue</option>
              <option value="profit">Profit</option>
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
          <div className="muted">오늘 YoY</div>
          <div className="kpi-value">{formatPercent(todayYoY)}</div>
          <div className="muted">{formatDate(endDate)}</div>
        </div>
        <div className="card">
          <div className="muted">이번주 YoY</div>
          <div className="kpi-value">{formatPercent(weekYoY)}</div>
          <div className="muted">fixed_7d 기준</div>
        </div>
        <div className="card">
          <div className="muted">이번달 YoY</div>
          <div className="kpi-value">{formatPercent(monthYoY)}</div>
          <div className="muted">Month 기준</div>
        </div>
        <div className="card">
          <div className="muted">YTD YoY</div>
          <div className="kpi-value">{formatPercent(ytdYoY)}</div>
          <div className="muted">2026-01-01 ~ {formatDate(endDate)}</div>
        </div>
      </div>

      <div className="chart-stack">
        <div className="card" style={{ width: "100%" }}>
          <h3>누적 매출 비교 & YoY</h3>
          <div style={{ width: "100%", overflow: "hidden" }}>
            <Plot
            data={[
              {
                x: cum2026Points.map((point) => point.x),
                y: cum2026Points.map((point) => point.y),
                type: "scatter",
                mode: "lines+markers",
                name: "2026 누적",
                line: { color: "#2563eb", width: 3 },
                yaxis: "y",
                hovertemplate: "%{x}<br>%{y:,.0f}<extra></extra>",
              },
              ...(show2025Line
                ? [
                    {
                      x: cum2025Points.map((point) => point.x),
                      y: cum2025Points.map((point) => point.y),
                      type: "scatter",
                      mode: "lines+markers",
                      name: "2025 동일기간",
                      line: { color: "#94a3b8", width: 2, dash: "dot" },
                      yaxis: "y",
                      hovertemplate: "%{x}<br>%{y:,.0f}<extra></extra>",
                    },
                  ]
                : []),
              ...(showYoY
                ? [
                    {
                      x: yoySeries.map((point) => point.x),
                      y: yoySeries.map((point) => point.y),
                      type: "scatter",
                      mode: "lines+markers",
                      name: "YoY",
                      line: { color: "#16a34a", width: 3 },
                      yaxis: "y2",
                      hovertemplate: "%{x}<br>%{y:.1f}%<extra></extra>",
                    },
                    {
                      x: yoySeries.map((point) => point.x),
                      y: yoySeries.map(() => baseline),
                      type: "scatter",
                      mode: "lines",
                      name: "100% 기준선",
                      line: { color: "#64748b", width: 2, dash: "dot" },
                      yaxis: "y2",
                      hoverinfo: "skip",
                    },
                  ]
                : []),
            ]}
            layout={{
              height: 400,
              margin: { l: 60, r: 20, t: 20, b: 40 },
              legend: { orientation: "h", y: -0.15 },
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "#ffffff",
              autosize: true,
              yaxis: {
                title: metric === "revenue" ? "누적 매출 (원)" : "누적 이익 (원)",
                tickprefix: metric === "revenue" ? "₩" : "",
                gridcolor: "#e5e7eb",
                side: "left",
              },
              yaxis2: {
                title: "YoY (%)",
                ticksuffix: "%",
                gridcolor: "transparent",
                side: "right",
                overlaying: "y",
                range: [yoyMin - yoyPadding, yoyMax + yoyPadding],
              },
              xaxis: { gridcolor: "#f1f5f9" },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%", height: "100%" }}
          />
          </div>
          {showYoY && (
            <p className="muted" style={{ marginTop: 8 }}>
              100% = 전년 동일, 100% 초과 = 성장, 100% 미만 = 감소
            </p>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div className="card">
            <h3>Item Drill-down</h3>
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
                  range: [selectedYoyMin - selectedYoyPadding, selectedYoyMax + selectedYoyPadding],
                  ticksuffix: "%",
                  gridcolor: "#e5e7eb",
                },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "#ffffff",
                legend: { orientation: "h" },
                xaxis: { gridcolor: "#f1f5f9" },
              }}
              config={{ displayModeBar: false, responsive: true }}
            />
          </div>

          <div className="card">
            <h3>Item 성과 테이블</h3>
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

