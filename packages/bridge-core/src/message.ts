import type { ApplyRequest } from "./protocol";

/**
 * Lean per-turn prompt: only non-empty fields, no JSON echo.
 * The trailing "需求: " line is the marker extractIntent() in the side
 * panel parses — keep the two in sync.
 */
export function buildBridgePrompt(payload: ApplyRequest): string {
  const { pageUrl, selection, intent, sourceHint } = payload;
  const lines: string[] = ["[Codeg UI Bridge]"];
  const field = (label: string, value: string | undefined | null): void => {
    const trimmed = value?.trim();
    if (trimmed) {
      lines.push(`${label}: ${trimmed}`);
    }
  };

  field("页面", pageUrl);
  // The selector already carries the tag when present, so one of the two suffices.
  field("元素", selection.selector || selection.tag);
  field("DOM", selection.domPath);
  field("文本", selection.text);
  if (selection.testAttributes?.length) {
    field("测试属性", selection.testAttributes.join(", "));
  }
  if (sourceHint?.file) {
    lines.push(`源码: ${sourceHint.file}${sourceHint.line ? `:${sourceHint.line}` : ""}`);
  }
  field("组件", sourceHint?.component);
  field("sourceId", sourceHint?.sourceId);
  if (payload.extra?.computedStyle) {
    field(
      "样式",
      Object.entries(payload.extra.computedStyle)
        .map(([key, value]) => `${key}: ${value}`)
        .join("; ")
    );
  }
  for (const entry of payload.extra?.consoleErrors ?? []) {
    lines.push(
      `报错: [${entry.level}] ${entry.message}${entry.source ? ` @ ${entry.source}${entry.line ? `:${entry.line}` : ""}` : ""}`
    );
  }

  lines.push(
    "",
    "要求：先读绑定源码，不足再追踪调用链；最小范围修改；完成后总结变更文件与影响范围。",
    `需求: ${intent.prompt}`
  );
  return lines.join("\n");
}
