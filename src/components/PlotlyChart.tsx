"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(async () => {
  const PlotlyModule = await import("plotly.js-basic-dist");
  const createPlotlyComponent = (await import("react-plotly.js/factory")).default;
  const Plotly = "default" in PlotlyModule ? PlotlyModule.default : PlotlyModule;
  return createPlotlyComponent(Plotly);
}, { ssr: false });

export default Plot;

