"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

const Plot = dynamic(async () => {
  const PlotlyModule = await import("plotly.js-basic-dist");
  const createPlotlyComponent = (await import("react-plotly.js/factory")).default;
  const Plotly = "default" in PlotlyModule ? PlotlyModule.default : PlotlyModule;
  return createPlotlyComponent(Plotly);
}, { ssr: false }) as React.ComponentType<PlotParams>;

export default Plot;

