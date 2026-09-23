const assert = require("node:assert/strict");
const tools = require("../lib/transcript.js");

const sampleVtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.500
<v Instructor>Hello &amp; welcome.</v>

2
00:00:04.000 --> 00:00:06.000 align:start
Today we learn *Markdown*.
`;

const cues = tools.parseTimedText(sampleVtt);
assert.equal(cues.length, 2);
assert.deepEqual(cues[0], { start: 1, end: 3.5, text: "Hello & welcome." });
assert.equal(tools.formatClock(65.25, false), "01:05");
assert.equal(tools.formatClock(3665.25, true), "01:01:05.250");
assert.equal(tools.safeFilename('Lecture: Intro / Part 1?'), "Lecture Intro Part 1");

const markdown = tools.exportTranscript({
  title: "Lecture 1",
  pageUrl: "https://school.example/d2l/le/content/1/viewContent/2/View",
  cues
}, "md", true);
assert.match(markdown, /^# Lecture 1/m);
assert.match(markdown, /- \*\*00:01\*\* Hello & welcome\./);
assert.match(markdown, /Today we learn \\\*Markdown\\\*\./);

const text = tools.exportTranscript({ title: "Lecture 1", cues }, "txt", false);
assert.equal(text, "Hello & welcome.\nToday we learn *Markdown*.\n");

const vtt = tools.exportTranscript({ title: "Lecture 1", cues }, "vtt", false);
assert.match(vtt, /^WEBVTT/);
assert.match(vtt, /00:00:01\.000 --> 00:00:03\.500/);

console.log("Transcript parser tests passed.");
