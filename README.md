# Brightspace Transcript Exporter

A small Chrome/Edge Manifest V3 extension that exports caption tracks already available on a course page as Markdown, plain text, or WebVTT.

## What it does

- Scans the current page and accessible frames only after you click the extension.
- Finds native `<video>`/`<audio>` caption tracks, including media inside open shadow roots.
- Reads browser `TextTrack` cues or fetches an attached VTT/SRT caption file with the page's existing session.
- Chooses the playing or most visible media first.
- Automatically downloads Markdown when exactly one transcript is found.
- Lists each language/track when several are available.
- Never asks for a Brightspace password or sends transcript data to a server.

The extension exports existing captions. It does not transcribe audio and does not bypass course or media permissions.

## Install locally

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project folder.
5. Pin **Brightspace Transcript Exporter** to the toolbar.

## Use

1. Open a Brightspace lesson containing a video and wait for the player to load.
2. Click the extension icon.
3. If one caption track is available, a Markdown transcript downloads immediately.
4. If several tracks are available, select the format and click the desired track's **Download** button.

### McGill Lecture Recordings

McGill's recording tool displays captions in a transcript sidebar hosted by `lrs.mcgill.ca`; it does not attach captions to the video as a browser text track. The extension has narrowly scoped access to `https://lrs.mcgill.ca/*` so it can read that already-visible transcript panel and export it. Reload the extension after updates, then refresh the recording page before testing.

If the player is visible but nothing is found, turn captions on or open **Settings → View transcript** in the Brightspace player and click **Scan again**.

## Test

Run the dependency-free parser test with Node.js:

```powershell
node tests/transcript.test.js
```

## Current limitations

- A video must already have captions. Missing captions require a separate speech-to-text feature.
- Cross-origin third-party players such as Panopto, Kaltura, YouTube, or Vimeo may need provider-specific adapters and optional host permission.
- Closed shadow roots and DRM-protected media cannot be inspected.
- Brightspace deployments can differ. Testing against a real, authorized course page is required before considering the extractor production-ready.
