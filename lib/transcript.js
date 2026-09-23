(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TranscriptTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function decodeEntities(value) {
    return String(value || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function cleanCueText(value) {
    return decodeEntities(String(value || "")
      .replace(/<\/?(?:c(?:\.[^ >]+)?|v|lang|ruby|rt|b|i|u)(?:\s+[^>]*)?>/gi, "")
      .replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseTime(value) {
    const match = String(value).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/);
    if (!match) return null;
    return (Number(match[1] || 0) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + (Number((match[4] || "0").padEnd(3, "0")) / 1000);
  }

  function parseTimedText(raw) {
    const normalized = String(raw || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.split("\n").map((line) => line.trimEnd());
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) continue;
      const times = lines[timingIndex].split("-->");
      const start = parseTime(times[0]);
      const end = parseTime(times[1]);
      const text = cleanCueText(lines.slice(timingIndex + 1).join(" "));
      if (start !== null && end !== null && text) cues.push({ start, end, text });
    }
    return cues;
  }

  function mergeRepeatedCues(cues) {
    const merged = [];
    for (const cue of cues || []) {
      const text = cleanCueText(cue.text);
      if (!text) continue;
      const previous = merged[merged.length - 1];
      if (previous && previous.text === text && Number(cue.start) <= previous.end + 0.15) {
        previous.end = Math.max(previous.end, Number(cue.end));
      } else {
        merged.push({ start: Number(cue.start) || 0, end: Number(cue.end) || 0, text });
      }
    }
    return merged;
  }

  function formatClock(seconds, milliseconds) {
    const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    const base = hours > 0 || milliseconds
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return milliseconds ? `${base}.${String(ms).padStart(3, "0")}` : base;
  }

  function escapeMarkdown(value) {
    return String(value).replace(/([\\`*_{}\[\]<>])/g, "\\$1");
  }

  function exportTranscript(item, format, timestamps) {
    const cues = mergeRepeatedCues(item.cues && item.cues.length ? item.cues : parseTimedText(item.raw || ""));
    if (!cues.length && item.raw && format === "vtt") return String(item.raw);
    if (!cues.length) throw new Error("No readable caption cues were found.");

    if (format === "vtt") {
      const body = cues.map((cue, index) =>
        `${index + 1}\n${formatClock(cue.start, true)} --> ${formatClock(cue.end, true)}\n${cue.text}`
      ).join("\n\n");
      return `WEBVTT\n\n${body}\n`;
    }

    const lines = cues.map((cue) => timestamps
      ? `${format === "md" ? `- **${formatClock(cue.start, false)}**` : `[${formatClock(cue.start, false)}]`} ${format === "md" ? escapeMarkdown(cue.text) : cue.text}`
      : (format === "md" ? escapeMarkdown(cue.text) : cue.text));

    if (format === "md") {
      const title = escapeMarkdown(item.title || "Video transcript");
      const source = item.pageUrl ? `\nSource: ${item.pageUrl}\n` : "";
      return `# ${title}\n${source}\n## Transcript\n\n${lines.join(timestamps ? "\n" : "\n\n")}\n`;
    }
    return `${lines.join("\n")}\n`;
  }

  function safeFilename(value) {
    const name = String(value || "video-transcript")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 120);
    return name || "video-transcript";
  }

  return { cleanCueText, parseTimedText, mergeRepeatedCues, formatClock, exportTranscript, safeFilename };
});
