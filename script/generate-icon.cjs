const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const PNG_PATH = path.join(BUILD_DIR, "icon.png");
const ICONSET_DIR = path.join(BUILD_DIR, "icon.iconset");
const ICNS_PATH = path.join(BUILD_DIR, "icon.icns");
const SIZE = 1024;

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.concat([typeBuffer, data]);
  let crc = 0xffffffff;
  for (const byte of crcBuffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  const finalCrc = (crc ^ 0xffffffff) >>> 0;
  const outputCrc = Buffer.alloc(4);
  outputCrc.writeUInt32BE(finalCrc, 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, outputCrc]);
}

function createIcnsElement(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length + 8, 0);
  return Buffer.concat([typeBuffer, lengthBuffer, data]);
}

function writePng(width, height, rgbaBuffer, outputPath) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgbaBuffer.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", compressed),
    createChunk("IEND", Buffer.alloc(0)),
  ]);

  fs.writeFileSync(outputPath, png);
}

function setPixel(buffer, x, y, color) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) {
    return;
  }

  const offset = (y * SIZE + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function fillRoundedRect(buffer, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const dx = Math.max(Math.max(x - px, 0), px - (x + width - 1));
      const dy = Math.max(Math.max(y - py, 0), py - (y + height - 1));

      if (dx === 0 || dy === 0) {
        setPixel(buffer, px, py, color);
        continue;
      }

      const cornerDx = Math.min(Math.abs(px - (x + radius)), Math.abs(px - (x + width - radius - 1)));
      const cornerDy = Math.min(Math.abs(py - (y + radius)), Math.abs(py - (y + height - radius - 1)));
      if (cornerDx * cornerDx + cornerDy * cornerDy <= radius * radius) {
        setPixel(buffer, px, py, color);
      }
    }
  }
}

function fillCircle(buffer, centerX, centerY, radius, color) {
  for (let py = centerY - radius; py <= centerY + radius; py += 1) {
    for (let px = centerX - radius; px <= centerX + radius; px += 1) {
      const dx = px - centerX;
      const dy = py - centerY;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(buffer, px, py, color);
      }
    }
  }
}

function paintBackground(buffer) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const mix = (x + y) / (SIZE * 2);
      const r = Math.round(15 + (21 - 15) * mix);
      const g = Math.round(23 + (94 - 23) * mix);
      const b = Math.round(42 + (239 - 42) * mix);
      setPixel(buffer, x, y, [r, g, b, 255]);
    }
  }
}

function paintMonogram(buffer) {
  const softWhite = [245, 248, 255, 255];
  const coolBlue = [133, 166, 255, 235];
  const cutout = [24, 49, 126, 255];

  fillRoundedRect(buffer, 180, 180, 660, 660, 170, [12, 20, 38, 0]);
  fillRoundedRect(buffer, 260, 250, 250, 520, 90, softWhite);
  fillCircle(buffer, 500, 510, 140, softWhite);
  fillRoundedRect(buffer, 332, 326, 110, 360, 48, cutout);
  fillCircle(buffer, 480, 510, 78, cutout);

  fillRoundedRect(buffer, 510, 250, 230, 520, 90, coolBlue);
  fillCircle(buffer, 706, 396, 114, coolBlue);
  fillCircle(buffer, 706, 624, 114, coolBlue);
  fillRoundedRect(buffer, 580, 324, 84, 372, 36, [24, 49, 126, 255]);
  fillCircle(buffer, 696, 396, 58, [24, 49, 126, 255]);
  fillCircle(buffer, 696, 624, 58, [24, 49, 126, 255]);

  fillCircle(buffer, 786, 230, 44, [255, 255, 255, 24]);
  fillCircle(buffer, 246, 794, 28, [255, 255, 255, 18]);
}

function generateBasePng() {
  const buffer = Buffer.alloc(SIZE * SIZE * 4);
  paintBackground(buffer);
  paintMonogram(buffer);
  writePng(SIZE, SIZE, buffer, PNG_PATH);
}

function buildIconset() {
  fs.rmSync(ICONSET_DIR, { force: true, recursive: true });
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  const sizes = [
    [16, "16x16"],
    [32, "16x16@2x"],
    [32, "32x32"],
    [64, "32x32@2x"],
    [128, "128x128"],
    [256, "128x128@2x"],
    [256, "256x256"],
    [512, "256x256@2x"],
    [512, "512x512"],
    [1024, "512x512@2x"],
  ];

  for (const [size, name] of sizes) {
    execFileSync("sips", ["-z", String(size), String(size), PNG_PATH, "--out", path.join(ICONSET_DIR, `icon_${name}.png`)], {
      stdio: "ignore",
    });
  }
}

function buildIcns() {
  const variants = [
    ["icp4", "icon_16x16.png"],
    ["icp5", "icon_16x16@2x.png"],
    ["icp6", "icon_32x32@2x.png"],
    ["ic07", "icon_128x128.png"],
    ["ic08", "icon_128x128@2x.png"],
    ["ic09", "icon_256x256@2x.png"],
    ["ic10", "icon_512x512@2x.png"],
  ];

  const elements = variants.map(([type, fileName]) =>
    createIcnsElement(type, fs.readFileSync(path.join(ICONSET_DIR, fileName))),
  );
  const totalLength = elements.reduce((sum, element) => sum + element.length, 8);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(totalLength, 4);

  fs.writeFileSync(ICNS_PATH, Buffer.concat([header, ...elements]));
}

fs.mkdirSync(BUILD_DIR, { recursive: true });
generateBasePng();
buildIconset();
buildIcns();
console.log(`Generated ${ICNS_PATH}`);
