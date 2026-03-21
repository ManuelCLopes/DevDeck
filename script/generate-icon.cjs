const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const SVG_PATH = path.join(BUILD_DIR, "icon.svg");
const PNG_PATH = path.join(BUILD_DIR, "icon.png");
const ICONSET_DIR = path.join(BUILD_DIR, "icon.iconset");
const ICNS_PATH = path.join(BUILD_DIR, "icon.icns");
const SIZE = 1024;

function createIcnsElement(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length + 8, 0);
  return Buffer.concat([typeBuffer, lengthBuffer, data]);
}

function renderBasePng() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "devdeck-icon-"));

  try {
    execFileSync(
      "qlmanage",
      ["-t", "-s", String(SIZE), "-o", tempDirectory, SVG_PATH],
      { stdio: "pipe" },
    );

    const renderedPngPath = path.join(tempDirectory, "icon.svg.png");
    if (!fs.existsSync(renderedPngPath)) {
      throw new Error(`Quick Look did not render ${SVG_PATH}`);
    }

    fs.copyFileSync(renderedPngPath, PNG_PATH);
  } finally {
    fs.rmSync(tempDirectory, { force: true, recursive: true });
  }
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
    execFileSync(
      "sips",
      [
        "-z",
        String(size),
        String(size),
        PNG_PATH,
        "--out",
        path.join(ICONSET_DIR, `icon_${name}.png`),
      ],
      { stdio: "ignore" },
    );
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
renderBasePng();
buildIconset();
buildIcns();
console.log(`Generated ${ICNS_PATH}`);
