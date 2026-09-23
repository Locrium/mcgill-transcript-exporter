const assert = require("node:assert/strict");
const { createZip } = require("../lib/zip.js");

const zip = createZip([{ name: "lecture.txt", content: "Hello captions" }]);
assert.equal(String.fromCharCode(...zip.slice(0, 4)), "PK\x03\x04");
assert.match(Buffer.from(zip).toString("utf8"), /lecture\.txt/);
assert.equal(String.fromCharCode(...zip.slice(-22, -18)), "PK\x05\x06");
console.log("ZIP tests passed.");
