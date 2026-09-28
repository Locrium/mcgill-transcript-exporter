/*
 * Direct LRS batch adapter. The bearer token is observed only from the
 * signed-in browser's own request to McGill's LRS API and stays in this
 * service worker's memory. It is never persisted or sent anywhere else.
 */
(() => {
  "use strict";

  const API_BASE = "https://lrswapi.campus.mcgill.ca/api";
  const tokenByTab = new Map();

  function decodeJwt(token) {
    try {
      const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(part));
    } catch (_) {
      return null;
    }
  }

  chrome.webRequest.onSendHeaders.addListener((details) => {
    const header = details.requestHeaders?.find((item) => item.name.toLowerCase() === "authorization");
    if (!header?.value?.startsWith("Bearer ") || details.tabId < 0) return;
    const token = header.value.slice("Bearer ".length);
    const claims = decodeJwt(token);
    const courseId = claims?.LRSCourseId;
    if (!courseId) return;
    tokenByTab.set(details.tabId, { token, courseId, expiresAt: Number(claims.exp || 0) * 1000 });
    console.info("[Transcript Exporter] LRS session ready for direct batch export.");
  }, {
    urls: ["https://lrswapi.campus.mcgill.ca/*"]
  }, ["requestHeaders", "extraHeaders"]);

  async function apiFetch(token, path) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json, text/vtt;q=0.9, */*;q=0.8" }
    });
    if (!response.ok) throw new Error(`LRS API returned ${response.status}. Refresh the Lecture Recordings page and try again.`);
    return response;
  }

  function activeSession(tabId) {
    const session = tokenByTab.get(tabId);
    if (!session) throw new Error("Direct batch access is not ready. Reload the Lecture Recordings page, wait for it to load, then reopen the extension.");
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      tokenByTab.delete(tabId);
      throw new Error("Your LRS session expired. Refresh the Lecture Recordings page and try again.");
    }
    return session;
  }

  async function listRecordings(tabId) {
    const session = activeSession(tabId);
    const response = await apiFetch(session.token, `/MediaRecordings/dto/${session.courseId}`);
    return response.json();
  }

  async function fetchTranscripts(tabId, recordings) {
    const session = activeSession(tabId);
    const results = [];
    for (const recording of recordings) {
      const id = recording.id ?? recording.recordingId ?? recording.recordingID;
      try {
        if (!id) throw new Error("Recording metadata did not include an id.");
        const response = await apiFetch(session.token, `/MediaRecordings/captionsvtt/${encodeURIComponent(id)}.vtt/en`);
        const raw = await response.text();
        if (!/WEBVTT|-->/.test(raw)) throw new Error("This recording has no readable English VTT captions.");
        results.push({ ...recording, raw, error: "" });
      } catch (error) {
        results.push({ ...recording, raw: "", error: error.message || String(error) });
      }
    }
    return results;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "LRS_LIST_RECORDINGS") {
      listRecordings(message.tabId).then((recordings) => sendResponse({ ok: true, recordings }), (error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    if (message?.type === "LRS_FETCH_TRANSCRIPTS") {
      fetchTranscripts(message.tabId, message.recordings || []).then((recordings) => sendResponse({ ok: true, recordings }), (error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    return undefined;
  });
})();
