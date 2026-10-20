import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReceiptCrop,
  estimateReceiptSkew,
  findReceiptContentBox,
  planReceiptCrop,
  planReceiptImageSize,
  planReceiptSegments,
  prepareReceiptImage,
} from "../../lib/harn-tee/receipt-image";

afterEach(() => vi.unstubAllGlobals());

it("preserves recognition section resolution instead of applying thumbnail limits", () => {
  const crop = planReceiptCrop({ width: 1200, height: 6000 }, { x0: 0, y0: 2072, x1: 1200, y1: 4272 }, { padding: 0, purpose: "segment" });
  expect({ width: crop.width, height: crop.height }).toEqual({ width: 1200, height: 2200 });
});

function pixels(width: number, height: number, background = 255) {
  const data = new Uint8ClampedArray(width * height * 4).fill(background);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}

function rectangle(image: ReturnType<typeof pixels>, x: number, y: number, width: number, height: number, gray = 0) {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      const offset = (row * image.width + column) * 4;
      image.data.set([gray, gray, gray, 255], offset);
    }
  }
}

function textRows(angle: number) {
  const image = pixels(400, 500);
  const slope = Math.tan(angle * Math.PI / 180);
  for (let row = 0; row < 9; row++) {
    for (let x = 50; x < 350; x++) {
      // Separated glyph strokes, including a separate price column.
      if (x % 12 >= 7 || (x > 235 && x < 295)) continue;
      const y = Math.round(65 + row * 40 + slope * (x - 200));
      rectangle(image, x, y, 1, 3, 35);
    }
  }
  return image;
}

// Browser API boundary only: real pixel fixtures feed analysis, but these doubles
// do not claim to verify canvas rasterization. Main performs that QA in a browser.
function browserImage(image = pixels(240, 480)) {
  const liveUrls = new Set<string>();
  const canvases: HTMLCanvasElement[] = [];
  const images: ControlledImage[] = [];
  const drawings: Array<{ args: unknown[]; filter: string; background: string }> = [];
  const rotations: number[] = [];
  const controls = { failContext: false, failPixels: false, afterDraw: () => {} };
  class ControlledImage {
    naturalWidth = image.width;
    naturalHeight = image.height;
    src = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { images.push(this); }
    removeAttribute(name: string) { if (name === "src") this.src = ""; }
  }
  vi.stubGlobal("window", {});
  vi.stubGlobal("Image", ControlledImage);
  vi.stubGlobal("URL", {
    createObjectURL() { const url = `blob:receipt-${liveUrls.size}`; liveUrls.add(url); return url; },
    revokeObjectURL(url: string) { liveUrls.delete(url); },
  });
  vi.stubGlobal("document", {
    createElement(tag: string) {
      if (tag !== "canvas") throw new Error(`Unexpected element: ${tag}`);
      const context = {
        filter: "none", fillStyle: "", imageSmoothingEnabled: true, imageSmoothingQuality: "low",
        fillRect() {},
        drawImage(...args: unknown[]) {
          drawings.push({ args, filter: this.filter, background: this.fillStyle });
          controls.afterDraw();
        },
        getImageData() { if (controls.failPixels) throw new Error("pixel read failed"); return image; },
        translate() {}, scale() {}, rotate(angle: number) { rotations.push(angle); },
      };
      const canvas = { width: 0, height: 0, getContext: () => controls.failContext ? null : context } as unknown as HTMLCanvasElement;
      canvases.push(canvas);
      return canvas;
    },
  });
  return { liveUrls, canvases, images, drawings, rotations, controls };
}

function receiptFile(type = "image/png") {
  return new File(["browser decoder boundary"], "receipt.png", { type });
}

describe("planReceiptSegments", () => {
  it("covers a long receipt at full width, including the final lines and overlapping seams", () => {
    expect(planReceiptSegments(1000, 6000)).toEqual([
      { x: 0, y: 0, width: 1000, height: 2200 },
      { x: 0, y: 2072, width: 1000, height: 2200 },
      { x: 0, y: 4144, width: 1000, height: 1856 },
    ]);
  });

  it("does not split a receipt that fits one segment", () => {
    expect(planReceiptSegments(1800, 2200)).toEqual([
      { x: 0, y: 0, width: 1800, height: 2200 },
    ]);
  });

  it("accepts twelve segments but asks the user to divide an image exceeding that coverage", () => {
    const segments = planReceiptSegments(300, 24992);
    expect(segments).toHaveLength(12);
    expect(segments[11]).toEqual({ x: 0, y: 22792, width: 300, height: 2200 });
    expect(() => planReceiptSegments(300, 24993)).toThrow(/แบ่ง|แยก/);
  });

  it.each([0, -1, NaN, Infinity, 1.5])("rejects an invalid source dimension %s", (dimension) => {
    expect(() => planReceiptSegments(dimension, 100)).toThrow();
    expect(() => planReceiptSegments(100, dimension)).toThrow();
  });
});

describe("planReceiptImageSize", () => {
  it("preserves text resolution on long receipts rather than shrinking the longest side to 2000", () => {
    expect(planReceiptImageSize(1200, 6000)).toEqual({ width: 1200, height: 6000 });
    expect(planReceiptImageSize(800, 10000)).toEqual({ width: 800, height: 10000 });
  });

  it("bounds wide sources to 1800 pixels without upscaling small images", () => {
    expect(planReceiptImageSize(4000, 8000)).toEqual({ width: 1800, height: 3600 });
    expect(planReceiptImageSize(500, 900)).toEqual({ width: 500, height: 900 });
  });

  it("bounds canvas area to eight megapixels while preserving aspect ratio", () => {
    const size = planReceiptImageSize(2000, 12000);
    expect(size.width * size.height).toBeLessThanOrEqual(8_000_000);
    expect(size.width).toBeGreaterThan(1100);
    expect(size.height).toBeGreaterThan(6900);
    expect(Math.abs(size.height / size.width - 6)).toBeLessThan(0.01);
  });

  it("refuses extremely long sources rather than silently losing lines or collapsing their width", () => {
    expect(() => planReceiptImageSize(200, 100000)).toThrow(/แบ่ง|แยก/);
  });

  it.each([0, -1, NaN, Infinity, 1.5])("rejects an invalid decoded dimension %s", (dimension) => {
    expect(() => planReceiptImageSize(dimension, 100)).toThrow();
    expect(() => planReceiptImageSize(100, dimension)).toThrow();
  });
});

describe("findReceiptContentBox", () => {
  it("removes only white margins while retaining padding around every text row", () => {
    const image = pixels(240, 480);
    for (let row = 0; row < 8; row++) rectangle(image, 60, 80 + row * 45, 120, 5);
    expect(findReceiptContentBox(image)).toEqual({ x0: 48, y0: 68, x1: 192, y1: 412 });
  });

  it("preserves a faint mark outside the main text column", () => {
    const image = pixels(240, 480);
    for (let row = 0; row < 8; row++) rectangle(image, 60, 80 + row * 45, 120, 5);
    rectangle(image, 18, 240, 2, 3, 240);
    expect(findReceiptContentBox(image)?.x0).toBeLessThanOrEqual(18);
  });

  it("declines to crop photographs with a non-white backdrop or content at an edge", () => {
    const photo = pixels(240, 480, 210);
    rectangle(photo, 50, 50, 140, 380, 255);
    rectangle(photo, 90, 100, 60, 5);
    expect(findReceiptContentBox(photo)).toBeNull();

    const touchingEdge = textRows(0);
    rectangle(touchingEdge, 0, 200, 20, 3);
    expect(findReceiptContentBox(touchingEdge)).toBeNull();
  });

  it("does not turn an empty image or isolated speck into a receipt crop", () => {
    const image = pixels(200, 300);
    expect(findReceiptContentBox(image)).toBeNull();
    rectangle(image, 100, 150, 1, 1);
    expect(findReceiptContentBox(image)).toBeNull();
  });
});

describe("estimateReceiptSkew", () => {
  it.each([-2, 1.5, 2.5])("finds supported text-row slope %s degrees from pixels", (angle) => {
    expect(estimateReceiptSkew(textRows(angle))).toBeCloseTo(angle, 0);
  });

  it("leaves straight rows unchanged", () => {
    expect(estimateReceiptSkew(textRows(0))).toBeNull();
  });

  it("does not guess rotations for blank, solid, sparse, or steeply tilted content", () => {
    expect(estimateReceiptSkew(pixels(400, 500))).toBeNull();
    expect(estimateReceiptSkew(pixels(400, 500, 20))).toBeNull();
    const sparse = pixels(400, 500);
    rectangle(sparse, 100, 100, 200, 2);
    expect(estimateReceiptSkew(sparse)).toBeNull();
    expect(estimateReceiptSkew(textRows(12))).toBeNull();
  });
});

describe("planReceiptCrop", () => {
  it("clips a line at the source edges and reserves white padding outside the image", () => {
    expect(planReceiptCrop({ width: 100, height: 80 }, { x0: -20, y0: 0, x1: 60, y1: 30 }, { padding: 10 })).toEqual({
      width: 80, height: 50,
      source: { x: 0, y: 0, width: 70, height: 40 },
      destination: { x: 10, y: 10, width: 70, height: 40 },
    });
  });

  it("enlarges a small price region for rereading without changing source coordinates", () => {
    expect(planReceiptCrop({ width: 1000, height: 4000 }, { x0: 800, y0: 3000, x1: 900, y1: 3020 }, { padding: 5, scale: 3 })).toEqual({
      width: 330, height: 90,
      source: { x: 795, y: 2995, width: 110, height: 30 },
      destination: { x: 0, y: 0, width: 330, height: 90 },
    });
  });

  it("bounds oversized line previews even with a large requested enlargement", () => {
    const crop = planReceiptCrop({ width: 1800, height: 4400 }, { x0: 0, y0: 0, x1: 1800, y1: 4400 }, { scale: 100 });
    expect(crop.width).toBeLessThanOrEqual(1800);
    expect(crop.height).toBeLessThanOrEqual(1000);
    expect(crop.width * crop.height).toBeLessThanOrEqual(1_000_000);
    expect(crop.source).toEqual({ x: 0, y: 0, width: 1800, height: 4400 });
  });

  it.each([
    { x0: 10, y0: 10, x1: 5, y1: 20 },
    { x0: 100, y0: 0, x1: 120, y1: 20 },
    { x0: NaN, y0: 0, x1: 20, y1: 20 },
  ])("rejects unusable boxes instead of returning unrelated pixels: %j", (box) => {
    expect(() => planReceiptCrop({ width: 100, height: 80 }, box)).toThrow();
  });

  it.each([{ scale: 0 }, { scale: NaN }, { padding: -1 }, { padding: Infinity }])("rejects invalid crop options: %j", (options) => {
    expect(() => planReceiptCrop({ width: 100, height: 80 }, { x0: 0, y0: 0, x1: 20, y1: 20 }, options)).toThrow();
  });
});

describe("prepareReceiptImage", () => {
  it("rejects server use instead of bypassing browser preparation", async () => {
    await expect(prepareReceiptImage(receiptFile())).rejects.toThrow(/เบราว์เซอร์/);
  });

  it.each(["application/pdf", "image/svg+xml"])("explains unsupported image format %s in Thai", async (type) => {
    const browser = browserImage();
    await expect(prepareReceiptImage(receiptFile(type))).rejects.toThrow(/รูป.*(JPG|PNG|WebP)/);
    expect(browser.liveUrls.size).toBe(0);
    expect(browser.images).toHaveLength(0);
  });

  it("allows HEIC images when the browser can decode them", async () => {
    const browser = browserImage();
    const result = prepareReceiptImage(receiptFile("image/heic"));
    void result.catch(() => {});
    expect(browser.images).toHaveLength(1);
    browser.images[0].onload?.();
    const prepared = await result;
    expect(prepared.canvas.width).toBeGreaterThan(0);
    prepared.dispose();
    expect(browser.liveUrls.size).toBe(0);
  });

  it("does not allocate image resources for an already aborted request", async () => {
    const browser = browserImage();
    const controller = new AbortController();
    controller.abort();
    await expect(prepareReceiptImage(receiptFile(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(browser.liveUrls.size).toBe(0);
    expect(browser.images).toHaveLength(0);
  });

  it("releases the URL and decoder after a corrupt image fails to load", async () => {
    const browser = browserImage();
    const result = prepareReceiptImage(receiptFile());
    expect(browser.liveUrls.size).toBe(1);
    browser.images[0].onerror?.();
    await expect(result).rejects.toThrow(/เปิดรูป.*(JPG|PNG|WebP)/);
    expect(browser.liveUrls.size).toBe(0);
    expect(browser.images[0]).toMatchObject({ src: "", onload: null, onerror: null });
    expect(browser.canvases).toHaveLength(0);
  });

  it("aborts a pending decode without waiting for a load event or leaking on a late event", async () => {
    const browser = browserImage();
    const controller = new AbortController();
    const result = prepareReceiptImage(receiptFile(), controller.signal);
    const lateLoad = browser.images[0].onload;
    controller.abort();
    lateLoad?.();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(browser.liveUrls.size).toBe(0);
    expect(browser.images[0]).toMatchObject({ src: "", onload: null, onerror: null });
    expect(browser.canvases).toHaveLength(0);
  });

  it("keeps a long source at useful resolution and allocates no tile canvases", async () => {
    const browser = browserImage(pixels(1000, 6000));
    const pending = prepareReceiptImage(receiptFile());
    browser.images[0].onload?.();
    const result = await pending;
    expect([result.canvas.width, result.canvas.height]).toEqual([1000, 6000]);
    expect(result.segments).toEqual([
      { x: 0, y: 0, width: 1000, height: 2200 },
      { x: 0, y: 2072, width: 1000, height: 2200 },
      { x: 0, y: 4144, width: 1000, height: 1856 },
    ]);
    expect(browser.canvases).toHaveLength(1);
    expect(browser.liveUrls.size).toBe(0);
    result.dispose();
    result.dispose();
    expect([result.canvas.width, result.canvas.height]).toEqual([0, 0]);
  });

  it("returns geometry after cropping and keeps original colors for rereading", async () => {
    const image = pixels(240, 480);
    for (let row = 0; row < 8; row++) rectangle(image, 60, 80 + row * 45, 120, 5);
    const browser = browserImage(image);
    const pending = prepareReceiptImage(receiptFile());
    browser.images[0].onload?.();
    const result = await pending;
    expect([result.canvas.width, result.canvas.height]).toEqual([144, 344]);
    expect(result.segments).toEqual([{ x: 0, y: 0, width: 144, height: 344 }]);
    expect(browser.drawings.every((drawing) => drawing.filter === "none")).toBe(true);
    expect(browser.canvases.filter((canvas) => canvas.width > 0)).toEqual([result.canvas]);
    result.dispose();
    expect(browser.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it("deskews supported text with an expanded canvas so rotation cannot clip the corners", async () => {
    const image = textRows(2);
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i] === 255) image.data.set([240, 240, 240, 255], i);
    }
    const browser = browserImage(image);
    const pending = prepareReceiptImage(receiptFile());
    browser.images[0].onload?.();
    const result = await pending;
    expect([result.canvas.width, result.canvas.height]).toEqual([418, 514]);
    expect(browser.rotations).toHaveLength(1);
    expect(browser.rotations[0]).toBeCloseTo(-2 * Math.PI / 180, 6);
    expect(result.segments).toEqual([{ x: 0, y: 0, width: 418, height: 514 }]);
    result.dispose();
  });

  it("releases the prepared canvas if its request is aborted after preparation", async () => {
    const browser = browserImage();
    const controller = new AbortController();
    const pending = prepareReceiptImage(receiptFile(), controller.signal);
    browser.images[0].onload?.();
    const result = await pending;
    controller.abort();
    expect([result.canvas.width, result.canvas.height]).toEqual([0, 0]);
    result.dispose();
  });

  it.each(["failContext", "failPixels"] as const)("releases every allocated canvas and URL on %s", async (failure) => {
    const browser = browserImage();
    browser.controls[failure] = true;
    const pending = prepareReceiptImage(receiptFile());
    browser.images[0].onload?.();
    await expect(pending).rejects.toThrow(/เตรียมรูป/);
    expect(browser.liveUrls.size).toBe(0);
    expect(browser.canvases.length).toBeGreaterThan(0);
    expect(browser.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it("releases a partially drawn source on abort", async () => {
    const browser = browserImage();
    const controller = new AbortController();
    browser.controls.afterDraw = () => controller.abort();
    const pending = prepareReceiptImage(receiptFile(), controller.signal);
    browser.images[0].onload?.();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(browser.liveUrls.size).toBe(0);
    expect(browser.canvases.length).toBeGreaterThan(0);
    expect(browser.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
});

describe("createReceiptCrop", () => {
  it("draws a clipped preview onto white without changing the source or thresholding its pixels", () => {
    const browser = browserImage();
    const source = document.createElement("canvas");
    source.width = 100; source.height = 80;
    const crop = createReceiptCrop(source, { x0: -20, y0: 0, x1: 60, y1: 30 }, { padding: 10 });
    expect([crop.width, crop.height]).toEqual([80, 50]);
    expect(browser.drawings).toEqual([{
      args: [source, 0, 0, 70, 40, 10, 10, 70, 40],
      filter: "none", background: "#fff",
    }]);
    expect([source.width, source.height]).toEqual([100, 80]);
  });

  it("offers grayscale only on an explicitly requested reread crop", () => {
    const browser = browserImage();
    const source = document.createElement("canvas");
    source.width = 100; source.height = 80;
    createReceiptCrop(source, { x0: 10, y0: 10, x1: 30, y1: 30 }, { grayscale: true });
    expect(browser.drawings[0].filter).toBe("grayscale(100%)");
    expect([source.width, source.height]).toEqual([100, 80]);
  });

  it("releases a crop allocation if a drawing context is unavailable", () => {
    const browser = browserImage();
    const source = document.createElement("canvas");
    source.width = 100; source.height = 80;
    browser.controls.failContext = true;
    expect(() => createReceiptCrop(source, { x0: 10, y0: 10, x1: 30, y1: 30 })).toThrow(/เตรียมรูป/);
    expect(browser.canvases.slice(1).every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect([source.width, source.height]).toEqual([100, 80]);
  });
});
