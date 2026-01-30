declare module "react-plotly.js" {
  import { Component } from "react";
  import { Data, Layout, Config } from "plotly.js";

  export interface PlotParams {
    data: Data[];
    layout?: Partial<Layout>;
    config?: Partial<Config>;
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (figure: any, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: any, graphDiv: HTMLElement) => void;
    onPurge?: (figure: any, graphDiv: HTMLElement) => void;
    onError?: (err: Error) => void;
    revision?: number;
    useResizeHandler?: boolean;
    debug?: boolean;
  }

  export default class Plot extends Component<PlotParams> {}
}

declare module "react-plotly.js/factory" {
  import { Component } from "react";
  import { PlotParams } from "react-plotly.js";

  export default function createPlotlyComponent(plotly: any): React.ComponentType<PlotParams>;
}

declare module "plotly.js-basic-dist" {
  const Plotly: any;
  export default Plotly;
  export = Plotly;
}

