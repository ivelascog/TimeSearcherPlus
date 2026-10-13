import { compactTraceEvent } from "./trace.mjs";

export const DEFAULT_TRACE_BUFFER_KB = 256 * 1024;
const TRACE_LOSS_MESSAGE =
  "Chromium trace buffer lost events; frame timings cannot be trusted";

export function isTraceBufferLoss(error) {
  return (
    !!error &&
    (error.code === "TRACE_BUFFER_LOSS" ||
      error === TRACE_LOSS_MESSAGE ||
      error.message === TRACE_LOSS_MESSAGE)
  );
}

export async function startFrameTrace(
  browser,
  {
    traceBufferSizeInKb = DEFAULT_TRACE_BUFFER_KB,
    enableArgumentFilter = true,
  } = {}
) {
  const session = await browser.newBrowserCDPSession();
  const events = [];
  const append = (event) => {
    const compact = compactTraceEvent(event);
    if (compact) events.push(compact);
  };
  const collect = ({ value }) => {
    for (const event of value) append(event);
  };
  session.on("Tracing.dataCollected", collect);
  try {
    await session.send("Tracing.start", {
      // Explicitly disable all other categories; a positive list alone also
      // enables Chromium's default categories.
      // GPU stage cost comes from toplevel tasks on GPU threads. The "gpu"
      // category adds per-command events we discard, and can fill the buffer.
      traceConfig: {
        recordMode: "recordUntilFull",
        includedCategories: ["blink.user_timing", "viz", "toplevel"],
        excludedCategories: ["*"],
        traceBufferSizeInKb,
        enableArgumentFilter,
      },
      transferMode: "ReportEvents",
    });
  } catch (error) {
    session.off("Tracing.dataCollected", collect);
    await session.detach();
    throw error;
  }
  return {
    async stop() {
      const complete = new Promise((resolve) =>
        session.once("Tracing.tracingComplete", resolve)
      );
      try {
        await session.send("Tracing.end");
        const result = await complete;
        if (result.dataLossOccurred) {
          const error = new Error(TRACE_LOSS_MESSAGE);
          error.code = "TRACE_BUFFER_LOSS";
          throw error;
        }
        return events;
      } finally {
        session.off("Tracing.dataCollected", collect);
        await session.detach();
      }
    },
  };
}
