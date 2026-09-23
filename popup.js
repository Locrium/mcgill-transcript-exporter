(function () {
  "use strict";

  const status = document.querySelector("#status");
  const results = document.querySelector("#results");
  const settings = document.querySelector("#settings");
  const format = document.querySelector("#format");
  const timestamps = document.querySelector("#timestamps");
  const retry = document.querySelector("#retry");
  let tracks = [];
  let autoDownloaded = false;

  function setEmpty(message) {
    results.replaceChildren();
    const box = document.createElement("div");
    box.className = "empty";
    box.textContent = message;
    results.append(box);
  }

  function signature(track) {
    const cues = track.cues || TranscriptTools.parseTimedText(track.raw || "");
    return `${track.title}|${track.language}|${cues.slice(0, 4).map((cue) => cue.text).join("|")}`;
  }

  function normalize(rawTracks) {
    const seen = new Set();
    return rawTracks
      .map((track) => ({ ...track, cues: track.cues && track.cues.length ? track.cues : TranscriptTools.parseTimedText(track.raw || "") }))
      .filter((track) => track.cues.length)
      .sort((a, b) => Number(b.playing) - Number(a.playing) || b.visibleArea - a.visibleArea)
      .filter((track) => {
        const key = signature(track);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  async function download(track, button) {
    button.disabled = true;
    try {
      const extension = format.value;
      const content = TranscriptTools.exportTranscript(track, extension, timestamps.checked);
      const mime = extension === "md" ? "text/markdown" : (extension === "vtt" ? "text/vtt" : "text/plain");
      const blobUrl = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
      await chrome.downloads.download({
        url: blobUrl,
        filename: `${TranscriptTools.safeFilename(track.title)}.${extension}`,
        conflictAction: "uniquify",
        saveAs: false
      });
      status.textContent = `Saved ${track.title}`;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch (error) {
      status.textContent = "The export could not be saved.";
      setEmpty(error.message || String(error));
    } finally {
      button.disabled = false;
    }
  }

  function render() {
    results.replaceChildren();
    settings.hidden = tracks.length === 0;
    if (!tracks.length) return;

    for (const track of tracks) {
      const row = document.createElement("div");
      row.className = "result";
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = track.title;
      const meta = document.createElement("span");
      const duration = track.cues.length ? TranscriptTools.formatClock(track.cues[track.cues.length - 1].end, false) : "";
      meta.textContent = [track.label || track.language || "Captions", duration, track.source].filter(Boolean).join(" · ");
      details.append(title, meta);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Download";
      button.addEventListener("click", () => download(track, button));
      row.append(details, button);
      results.append(row);
    }
  }

  async function scan() {
    retry.hidden = true;
    settings.hidden = true;
    status.textContent = "Looking for captions…";
    results.replaceChildren();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) throw new Error("Open a Brightspace course page containing a video first.");

      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["extractor.js"] });
      const frameResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: async () => globalThis.__brightspaceTranscriptCollect ? globalThis.__brightspaceTranscriptCollect() : { mediaCount: 0, tracks: [] }
      });
      const payloads = frameResults.map((entry) => entry.result).filter(Boolean);
      const mediaCount = payloads.reduce((sum, payload) => sum + (payload.mediaCount || 0), 0);
      tracks = normalize(payloads.flatMap((payload) => payload.tracks || []));

      if (!tracks.length) {
        status.textContent = mediaCount ? "No captions found" : "No video found";
        setEmpty(mediaCount
          ? "A video was found, but it has no readable captions. Try turning captions on or opening Brightspace's View transcript panel, then scan again."
          : "No HTML video was found on this page. Open the lesson containing the video, then scan again. Third-party embedded players may need a future provider adapter.");
        retry.hidden = false;
        return;
      }

      status.textContent = tracks.length === 1 ? "Transcript found" : `${tracks.length} caption tracks found`;
      render();

      if (tracks.length === 1 && !autoDownloaded) {
        autoDownloaded = true;
        const button = results.querySelector("button");
        await download(tracks[0], button);
      }
    } catch (error) {
      status.textContent = "Could not scan this page";
      setEmpty(error.message || String(error));
      retry.hidden = false;
    }
  }

  retry.addEventListener("click", scan);
  format.addEventListener("change", () => { timestamps.disabled = format.value === "vtt"; });
  scan();
})();
