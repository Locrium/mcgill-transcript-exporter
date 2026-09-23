(function () {
  "use strict";

  function deepElements(selector, root = document) {
    const found = Array.from(root.querySelectorAll(selector));
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) found.push(...deepElements(selector, element.shadowRoot));
    }
    return found;
  }

  function visibleArea(element) {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    return width * height;
  }

  function mediaTitle(media, index) {
    const direct = media.getAttribute("aria-label") || media.getAttribute("title");
    if (direct) return direct.trim();
    let current = media;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      const heading = current.querySelector && current.querySelector("h1, h2, h3, h4, [role='heading']");
      if (heading && heading.textContent.trim()) return heading.textContent.trim();
    }
    const documentTitle = document.title.replace(/\s*[|–—-]\s*Brightspace.*$/i, "").trim();
    return documentTitle || `Video ${index + 1}`;
  }

  function serializeTrack(track) {
    try {
      if (!track || !track.cues) return [];
      return Array.from(track.cues).map((cue) => ({
        start: Number(cue.startTime),
        end: Number(cue.endTime),
        text: String(cue.text || "")
      })).filter((cue) => cue.text.trim());
    } catch (_) {
      return [];
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function readTextTracks(media) {
    const tracks = Array.from(media.textTracks || []);
    const originalModes = tracks.map((track) => track.mode);
    for (const track of tracks) {
      if (track.kind === "captions" || track.kind === "subtitles") {
        try { track.mode = "hidden"; } catch (_) {}
      }
    }
    if (tracks.some((track) => !track.cues)) await wait(700);

    const results = tracks.map((track, index) => ({
      language: track.language || "",
      label: track.label || track.language || `Track ${index + 1}`,
      cues: serializeTrack(track)
    })).filter((track) => track.cues.length);

    tracks.forEach((track, index) => {
      try { track.mode = originalModes[index]; } catch (_) {}
    });
    return results;
  }

  async function fetchCaption(url) {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) return "";
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      if (/WEBVTT|-->/.test(text) || /text\/(vtt|plain)|subrip/i.test(contentType)) return text;
    } catch (_) {}
    return "";
  }

  function likelyCaptionUrls(media) {
    const urls = [];
    for (const track of Array.from(media.querySelectorAll("track"))) {
      if (track.src) urls.push({ url: track.src, language: track.srclang || "", label: track.label || track.srclang || "Captions" });
    }

    let container = media.parentElement;
    for (let depth = 0; container && depth < 4; depth += 1, container = container.parentElement) {
      for (const anchor of container.querySelectorAll("a[href]")) {
        const href = anchor.href || "";
        const label = `${anchor.textContent} ${anchor.getAttribute("download") || ""}`;
        if (/\.(vtt|srt)(?:$|[?#])/i.test(href) || (/transcript|caption|subtitle/i.test(label) && /download|transcript|caption/i.test(href))) {
          urls.push({ url: href, language: anchor.hreflang || "", label: anchor.textContent.trim() || "Captions" });
        }
      }
    }
    return urls.filter((entry, index) => urls.findIndex((other) => other.url === entry.url) === index);
  }

  function parseClock(value) {
    const parts = String(value || "").trim().split(":").map(Number);
    if (parts.some((part) => Number.isNaN(part))) return null;
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    return null;
  }

  function readTranscriptPane() {
    const captions = Array.from(document.querySelectorAll('[id^="caption-"]'));
    const cues = captions.map((caption) => {
      const row = caption.closest('.v-list-item, [role="listitem"], li') || caption.parentElement;
      const timeText = row && (row.querySelector('.v-list-item__action-text, time, [class*="time"]') || row.firstElementChild);
      return {
        start: parseClock(timeText && timeText.textContent),
        text: caption.textContent.trim()
      };
    }).filter((cue) => cue.start !== null && cue.text);

    return cues.map((cue, index) => ({
      start: cue.start,
      end: index < cues.length - 1 ? Math.max(cue.start + 0.001, cues[index + 1].start) : cue.start + 4,
      text: cue.text
    }));
  }

  async function collect() {
    const mediaElements = deepElements("video, audio");
    const output = [];

    for (let index = 0; index < mediaElements.length; index += 1) {
      const media = mediaElements[index];
      const title = mediaTitle(media, index);
      const base = {
        title,
        pageUrl: location.href,
        mediaType: media.tagName.toLowerCase(),
        playing: !media.paused && !media.ended,
        visibleArea: visibleArea(media)
      };

      const nativeTracks = await readTextTracks(media);
      for (const track of nativeTracks) output.push({ ...base, ...track, source: "browser caption track" });

      const urls = likelyCaptionUrls(media);
      for (const candidate of urls) {
        const raw = await fetchCaption(candidate.url);
        if (raw) output.push({ ...base, ...candidate, raw, source: "caption file" });
      }
    }

    // McGill's Lecture Recording System renders a searchable transcript pane,
    // rather than attaching it as a native WebVTT track to its Video.js player.
    // This generic shape also covers similarly structured transcript sidebars.
    const paneCues = readTranscriptPane();
    if (paneCues.length) {
      output.push({
        title: document.title.replace(/\s+-\s+$/g, "").trim() || "Lecture recording",
        pageUrl: location.href,
        mediaType: "video",
        playing: false,
        visibleArea: 1,
        language: "",
        label: "Transcript",
        cues: paneCues,
        source: "transcript panel"
      });
    }

    if (mediaElements.length === 1 && output.length === 0) {
      const performanceUrls = performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => /(?:\.vtt(?:$|[?#])|caption|transcript|subtitle)/i.test(url))
        .slice(-8);
      for (const url of performanceUrls) {
        const raw = await fetchCaption(url);
        if (raw) output.push({
          title: mediaTitle(mediaElements[0], 0), pageUrl: location.href, mediaType: "video",
          playing: !mediaElements[0].paused, visibleArea: visibleArea(mediaElements[0]),
          language: "", label: "Captions", raw, source: "loaded caption resource", url
        });
      }
    }

    return { mediaCount: Math.max(mediaElements.length, paneCues.length ? 1 : 0), tracks: output };
  }

  globalThis.__brightspaceTranscriptCollect = collect;
})();
