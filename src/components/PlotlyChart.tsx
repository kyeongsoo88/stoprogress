"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

const Plot = dynamic(async () => {
  // @ts-ignore - plotly.js-dist-min doesn't have type definitions
  const PlotlyModule = await import("plotly.js-dist-min");
  // @ts-ignore - react-plotly.js/factory doesn't have type definitions
  const createPlotlyComponent = (await import("react-plotly.js/factory")).default;
  const Plotly = "default" in PlotlyModule ? PlotlyModule.default : PlotlyModule;
  return createPlotlyComponent(Plotly);
}, { ssr: false }) as React.ComponentType<PlotParams>;

export default Plot;

