(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ZipTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256).map((_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value >>> 0;
  });

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
    return (value ^ 0xffffffff) >>> 0;
  }

  function words(values) {
    const output = new Uint8Array(values.length * 2);
    values.forEach((value, index) => { output[index * 2] = value & 0xff; output[index * 2 + 1] = (value >>> 8) & 0xff; });
    return output;
  }

  function dword(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }

  function concat(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length); let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  // Creates a standard ZIP archive using the lossless "store" method. Keeping it
  // dependency-free means captions never need to leave the browser to be zipped.
  function createZip(files) {
    const local = []; const central = []; let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name); const data = encoder.encode(file.content);
      const crc = crc32(data);
      const localHeader = concat([dword(0x04034b50), words([20, 0, 0, 0, 0]), dword(crc), dword(data.length), dword(data.length), words([name.length, 0]), name, data]);
      local.push(localHeader);
      central.push(concat([dword(0x02014b50), words([20, 20, 0, 0, 0]), dword(crc), dword(data.length), dword(data.length), words([name.length, 0, 0, 0, 0]), dword(0), dword(offset), name]));
      offset += localHeader.length;
    }
    const centralData = concat(central);
    return concat([...local, centralData, dword(0x06054b50), words([0, 0, files.length, files.length]), dword(centralData.length), dword(offset), words([0])]);
  }
  return { createZip };
});
