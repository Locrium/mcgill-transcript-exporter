const assert = require("node:assert/strict");
const { createZip } = require("../lib/zip.js");

const zip = createZip([{ name: "lecture.txt", content: "Hello captions" }]);
const bytes = Buffer.from(zip);
assert.equal(String.fromCharCode(...zip.slice(0, 4)), "PK\x03\x04");
assert.match(bytes.toString("utf8"), /lecture\.txt/);
assert.equal(String.fromCharCode(...zip.slice(-22, -18)), "PK\x05\x06");

// Validate the central-directory field alignment. The modified DOS date is at
// byte 12 and the CRC begins at byte 16 of a central directory entry.
const central = bytes.indexOf(Buffer.from("PK\x01\x02"));
assert.ok(central >= 0, "central directory exists");
assert.equal(bytes.readUInt16LE(central + 12), 0, "central modified date is present");
assert.equal(bytes.readUInt32LE(central + 16), bytes.readUInt32LE(14), "central CRC matches local header");
console.log("ZIP tests passed.");
