# McGill Transcript Exporter

A small Chrome/Edge Manifest V3 extension that exports captions already available to the signed-in student as Markdown, plain text, or WebVTT. It supports native Brightspace media and McGill Lecture Recording System transcript panels.

> Unofficial project. It is not affiliated with, endorsed by, or supported by McGill University, D2L, Brightspace, or McGill's Lecture Recording System.

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
5. Pin **McGill Transcript Exporter** to the toolbar.

After changing project files, click the extension's **Reload** button on the extensions page and refresh the course page.

## Use

1. Open a Brightspace lesson containing a video and wait for the player to load.
2. Click the extension icon.
3. If one caption track is available, a Markdown transcript downloads immediately.
4. If several tracks are available, select the format and click the desired track's **Download** button.

### McGill Lecture Recordings

McGill's recording tool displays captions in a transcript sidebar hosted by `lrs.mcgill.ca`; it does not attach captions to the video as a browser text track. The extension has narrowly scoped access to `https://lrs.mcgill.ca/*` so it can read that already-visible transcript panel and export it. Reload the extension after updates, then refresh the recording page before testing.

If the player is visible but nothing is found, turn captions on or open **Settings → View transcript** in the Brightspace player and click **Scan again**.

## Permissions and privacy

The extension is designed to process content locally in the browser.

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Lets the extension inspect only the tab where the user clicked its icon. |
| `scripting` | Lets it inspect the page's media, caption tracks, and transcript DOM. |
| `downloads` | Saves the selected Markdown, TXT, or VTT file to the user's Downloads folder. |
| `https://lrs.mcgill.ca/*` | Lets the McGill adapter inspect the embedded Lecture Recording System frame where its transcript sidebar is rendered. |

The extension does **not**:

- send transcript text, URLs, credentials, cookies, or analytics to a server;
- ask for or store a Brightspace password;
- read arbitrary browsing history;
- bypass course access, authentication, DRM, or download restrictions;
- generate a transcript for a video that has no captions.

## Responsible-use rules

Use this extension only for recordings and transcripts you are authorized to access through your own Brightspace account.

- Follow your university's acceptable-use rules, course policies, and applicable copyright terms.
- Treat exported transcripts as course material. Do not publicly repost, sell, or redistribute them without permission from the instructor or rights holder.
- Review auto-generated captions before relying on them for quotations, accessibility work, or academic submissions; caption text may contain errors.
- Do not modify the extension to bypass access controls or extract content that is not visible to the signed-in user.

## Support and warnings

| Situation | Expected behavior |
| --- | --- |
| Brightspace video with a VTT/SRT caption track | Exports the track. |
| McGill LRS recording with transcript sidebar | Exports the visible transcript rows and timestamps. |
| Video without captions/transcript | Reports that no readable transcript was found. |
| Panopto, Kaltura, YouTube, Vimeo, or another external player | May require a dedicated adapter. |
| Player markup changes | The relevant adapter may need an update. |

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

## Development

Run the parser test after changes:

```powershell
node tests/transcript.test.js
```

The extension contains two extraction strategies:

- Native media: reads browser caption tracks or attached VTT/SRT files.
- McGill LRS: reads the transcript rows already rendered in the `lrs.mcgill.ca` embedded frame.
