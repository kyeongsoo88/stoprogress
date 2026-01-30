"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

const Plot = dynamic(async () => {
  // @ts-ignore - plotly.js-basic-dist doesn't have type definitions
  const PlotlyModule = await import("plotly.js-basic-dist");
  // @ts-ignore - react-plotly.js/factory doesn't have type definitions
  const createPlotlyComponent = (await import("react-plotly.js/factory")).default;
  const Plotly = "default" in PlotlyModule ? PlotlyModule.default : PlotlyModule;
  return createPlotlyComponent(Plotly);
}, { ssr: false }) as React.ComponentType<PlotParams>;

export default Plot;

