export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SourceHint = {
  file?: string;
  line?: number;
  column?: number;
  component?: string;
  sourceId?: string;
};

export type SelectionPayload = {
  tag: string;
  selector?: string;
  domPath?: string;
  semanticPath?: string;
  text?: string;
  rect?: Rect;
  testAttributes?: string[];
};

export type ApplyIntent = {
  type: "describe" | "move" | "resize" | "unknown";
  prompt: string;
};

export type ApplyRequest = {
  pageUrl: string;
  selection: SelectionPayload;
  intent: ApplyIntent;
  sourceHint?: SourceHint;
};
