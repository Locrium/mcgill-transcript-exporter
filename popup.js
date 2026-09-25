(function () {
  "use strict";

  const status = document.querySelector("#status");
  const results = document.querySelector("#results");
  const settings = document.querySelector("#settings");
  const format = document.querySelector("#format");
  const timestamps = document.querySelector("#timestamps");
  const retry = document.querySelector("#retry");
  const batch = document.querySelector("#batch");
  const batchPanel = document.querySelector("#batchPanel");
  const batchEnabled = document.querySelector("#batchEnabled");
  let tracks = [];
  let availableRecordings = [];

  async function loadSettings() {
    const saved = await chrome.storage.local.get({ batchEnabled: true });
    batchEnabled.checked = saved.batchEnabled;
  }

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
      details.className = "track-details";
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
      const recordingResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => globalThis.__brightspaceBatchList ? globalThis.__brightspaceBatchList() : []
      });
      availableRecordings = recordingResults.flatMap((entry) => entry.result || []);
      batch.hidden = !batchEnabled.checked || availableRecordings.length < 2;

      if (!tracks.length) {
        status.textContent = mediaCount ? "No captions found" : "No video found";
        setEmpty(mediaCount
          ? "A video was found, but it has no readable captions. Try turning captions on or opening Brightspace's View transcript panel, then scan again."
          : "No HTML video was found on this page. Open the lesson containing the video, then scan again. Third-party embedded players may need a future provider adapter.");
        retry.hidden = false;
        return;
      }

      status.textContent = tracks.length === 1 ? "Transcript found — choose Download" : `${tracks.length} caption tracks found`;
      render();
    } catch (error) {
      status.textContent = "Could not scan this page";
      setEmpty(error.message || String(error));
      retry.hidden = false;
    }
  }

  function showBatch() {
    const recordings = availableRecordings;
    batchPanel.replaceChildren(); batchPanel.hidden = false; batch.hidden = true; settings.hidden = true;
    const heading = document.createElement('strong'); heading.textContent = 'Choose recordings';
    const note = document.createElement('p'); note.textContent = 'Exports selected visible transcripts into one ZIP file.';
    const list = document.createElement('div'); list.className = 'recording-list';
    for (const recording of recordings) {
      const label = document.createElement('label'); label.className = 'recording';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = recording.id; input.checked = recording.active;
      const text = document.createElement('span'); text.textContent = recording.title;
      label.append(input, text); list.append(label);
    }
    const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = 'Export selected ZIP';
    exportButton.addEventListener('click', () => exportBatch(recordings, exportButton));
    batchPanel.append(heading, note, list, exportButton);
  }

  async function exportBatch(recordings, button) {
    const ids = [...batchPanel.querySelectorAll('input:checked')].map((input) => input.value);
    if (!ids.length) { status.textContent = 'Choose at least one recording'; return; }
    button.disabled = true; status.textContent = `Preparing ${ids.length} recording${ids.length === 1 ? '' : 's'}…`;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: (selected) => globalThis.__brightspaceBatchCollect ? globalThis.__brightspaceBatchCollect(selected) : null, args: [ids] });
      const payload = results.map((entry) => entry.result).find((entry) => entry && entry.recordings?.length);
      if (!payload) throw new Error('Could not reach the Lecture Recordings frame. Refresh the page and try again.');
      const extension = format.value;
      const files = payload.recordings.filter((recording) => recording.cues?.length).map((recording) => ({
        name: `${TranscriptTools.safeFilename(recording.title)}.${extension}`,
        course: recording.course,
        content: TranscriptTools.exportTranscript(recording, extension, timestamps.checked)
      }));
      if (!files.length) throw new Error(payload.recordings.find((recording) => recording.error)?.error || 'No readable transcripts were found.');
      const url = URL.createObjectURL(new Blob([ZipTools.createZip(files)], { type: 'application/zip' }));
      const course = files.find((file) => file.course)?.course;
      const zipName = course ? `${TranscriptTools.safeFilename(course)} - transcripts.zip` : 'mcgill-transcripts.zip';
      await chrome.downloads.download({ url, filename: zipName, conflictAction: 'uniquify', saveAs: false });
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const failed = payload.recordings.length - files.length;
      status.textContent = failed ? `Saved ${files.length}; ${failed} could not be read` : `Saved ${files.length} transcript${files.length === 1 ? '' : 's'}`;
    } catch (error) { status.textContent = 'Batch export could not finish'; setEmpty(error.message || String(error)); }
    finally { button.disabled = false; }
  }

  retry.addEventListener("click", scan);
  batch.addEventListener('click', showBatch);
  batchEnabled.addEventListener('change', async () => {
    await chrome.storage.local.set({ batchEnabled: batchEnabled.checked });
    batch.hidden = !batchEnabled.checked || availableRecordings.length < 2;
    if (!batchEnabled.checked) batchPanel.hidden = true;
  });
  format.addEventListener("change", () => { timestamps.disabled = format.value === "vtt"; });
  loadSettings().then(scan);
})();
