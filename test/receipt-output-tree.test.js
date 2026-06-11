import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileSystemGateway } from "../src/gateways/fs-gateway.js";
import {
  collectSidecarFiles,
  deriveReceiptBaseName,
  loadExistingHashes,
  loadExistingInvoiceNumbers,
  planReceiptWrite,
  receiptMonthDir,
  uniqueBaseName,
  walkOutputTree,
} from "../src/receipt-output-tree.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const REAL_FS = new FileSystemGateway();
const FAKE_PDF = Buffer.from("%PDF-1.4 fake content for tests");
const FAKE_PDF_HASH = createHash("sha256").update(FAKE_PDF).digest("hex");

let tmpDir;

beforeEach(() => {
  tmpDir = join("/tmp", `mailctl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── walkOutputTree ────────────────────────────────────────────────────────────

describe("walkOutputTree", () => {
  it("does nothing when the output directory does not exist", () => {
    const visitor = mock(() => {});
    walkOutputTree("/does/not/exist", REAL_FS, visitor);
    expect(visitor).not.toHaveBeenCalled();
  });

  describe("visits files in year/month subdirectories", () => {
    it("visits exactly one file", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited).toHaveLength(1);
    });

    it("visited file has correct fileName", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited[0].fileName).toBe("receipt.json");
    });

    it("visited file has correct filePath", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited[0].filePath).toBe(join(monthDir, "receipt.json"));
    });
  });

  it("skips non-year top-level directories", () => {
    const badDir = join(tmpDir, "not-a-year");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "file.txt"), "data");

    const visitor = mock(() => {});
    walkOutputTree(tmpDir, REAL_FS, visitor);
    expect(visitor).not.toHaveBeenCalled();
  });

  describe("visits files across multiple years and months", () => {
    it("visits two files", () => {
      mkdirSync(join(tmpDir, "2024", "12"), { recursive: true });
      mkdirSync(join(tmpDir, "2025", "01"), { recursive: true });
      writeFileSync(join(tmpDir, "2024", "12", "a.pdf"), "pdf1");
      writeFileSync(join(tmpDir, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toHaveLength(2);
    });

    it("visits a.pdf from 2024", () => {
      mkdirSync(join(tmpDir, "2024", "12"), { recursive: true });
      mkdirSync(join(tmpDir, "2025", "01"), { recursive: true });
      writeFileSync(join(tmpDir, "2024", "12", "a.pdf"), "pdf1");
      writeFileSync(join(tmpDir, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toContain("a.pdf");
    });

    it("visits b.json from 2025", () => {
      mkdirSync(join(tmpDir, "2024", "12"), { recursive: true });
      mkdirSync(join(tmpDir, "2025", "01"), { recursive: true });
      writeFileSync(join(tmpDir, "2024", "12", "a.pdf"), "pdf1");
      writeFileSync(join(tmpDir, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toContain("b.json");
    });
  });

  describe("continues past files that cause visitor errors (default no-op onError)", () => {
    it("still visits good.json after bad.json throws", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "good.json"), "{}");
      writeFileSync(join(monthDir, "bad.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        if (fileName === "bad.json") throw new Error("intentional");
        visited.push(fileName);
      });
      expect(visited).toContain("good.json");
    });

    it("does not include bad.json in visited list", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "good.json"), "{}");
      writeFileSync(join(monthDir, "bad.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        if (fileName === "bad.json") throw new Error("intentional");
        visited.push(fileName);
      });
      expect(visited).not.toContain("bad.json");
    });
  });

  describe("calls onError with the error and file context when visitor throws", () => {
    it("calls onError once", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        tmpDir,
        REAL_FS,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors).toHaveLength(1);
    });

    it("passes the error message to onError", () => {
      const monthDir2 = join(tmpDir, "2025", "03");
      mkdirSync(monthDir2, { recursive: true });
      writeFileSync(join(monthDir2, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        tmpDir,
        REAL_FS,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors[0].err.message).toBe("visitor-fail");
    });

    it("passes ctx.level as file to onError", () => {
      const monthDir3 = join(tmpDir, "2025", "03");
      mkdirSync(monthDir3, { recursive: true });
      writeFileSync(join(monthDir3, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        tmpDir,
        REAL_FS,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors[0].ctx.level).toBe("file");
    });

    it("passes ctx.op as visitor to onError when visitor throws", () => {
      const monthDir4 = join(tmpDir, "2025", "03");
      mkdirSync(monthDir4, { recursive: true });
      writeFileSync(join(monthDir4, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        tmpDir,
        REAL_FS,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors[0].ctx.op).toBe("visitor");
    });
  });

  describe("calls onError with op readdir when a month directory read fails", () => {
    it("passes ctx.op as readdir and ctx.level as month", () => {
      // Build a fake fs where readdir throws for one month directory
      const yearPath = join(tmpDir, "2025");
      mkdirSync(join(yearPath, "03"), { recursive: true });
      mkdirSync(join(yearPath, "04"), { recursive: true });
      writeFileSync(join(yearPath, "04", "receipt.json"), "{}");

      const errors = [];
      const mockFs = {
        exists: () => true,
        readdir: (p) => {
          if (p === join(yearPath, "03")) throw new Error("readdir failed");
          return REAL_FS.readdir(p);
        },
      };

      const visited = [];
      walkOutputTree(
        tmpDir,
        /** @type {any} */ (mockFs),
        (_fp, fn) => visited.push(fn),
        (_err, ctx) => errors.push(ctx),
      );

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].op).toBe("readdir");
      expect(errors[0].level).toBe("month");
      expect(visited).toContain("receipt.json");
    });
  });
});

// ── loadExistingInvoiceNumbers ────────────────────────────────────────────────

describe("loadExistingInvoiceNumbers", () => {
  it("returns an empty Set when the output directory does not exist", () => {
    const result = loadExistingInvoiceNumbers("/does/not/exist", REAL_FS);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set for an empty directory", () => {
    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  it("extracts invoice numbers from JSON sidecars in year/month subdirectories", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "receipt.json"), JSON.stringify({ invoice_number: "INV-001" }));

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.has("INV-001")).toBe(true);
  });

  it("ignores non-year top-level directories", () => {
    const badDir = join(tmpDir, "not-a-year");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "some.json"), JSON.stringify({ invoice_number: "SKIP-ME" }));

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  it("ignores JSON files without an invoice_number field", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "no-invoice.json"), JSON.stringify({ vendor: "Acme" }));

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  describe("collects invoice numbers from multiple months", () => {
    it("includes INV-001 from march", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      writeFileSync(join(march, "a.json"), JSON.stringify({ invoice_number: "INV-001" }));
      writeFileSync(join(april, "b.json"), JSON.stringify({ invoice_number: "INV-002" }));

      const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
      expect(result.has("INV-001")).toBe(true);
    });

    it("includes INV-002 from april", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      writeFileSync(join(march, "a.json"), JSON.stringify({ invoice_number: "INV-001" }));
      writeFileSync(join(april, "b.json"), JSON.stringify({ invoice_number: "INV-002" }));

      const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
      expect(result.has("INV-002")).toBe(true);
    });
  });

  it("ignores non-json files in month directories", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "receipt.pdf"), FAKE_PDF);

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  describe("calls onError when reading a JSON sidecar file fails", () => {
    it("calls the onError callback when readJson throws", () => {
      const errors = [];
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "bad.json"), "not valid json");

      loadExistingInvoiceNumbers(tmpDir, REAL_FS, (err, ctx) => errors.push({ err, ctx }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it("passes the full Error object to onError", () => {
      const errors = [];
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "bad.json"), "not valid json");

      loadExistingInvoiceNumbers(tmpDir, REAL_FS, (err, ctx) => errors.push({ err, ctx }));
      expect(errors[0].err).toBeInstanceOf(Error);
    });
  });
});

// ── loadExistingHashes ────────────────────────────────────────────────────────

describe("loadExistingHashes", () => {
  it("returns an empty Set when the output directory does not exist", () => {
    const result = loadExistingHashes("/does/not/exist", REAL_FS);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set for an empty directory", () => {
    const result = loadExistingHashes(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  it("returns the SHA-256 hash of a PDF in a year/month subdirectory", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "invoice.pdf"), FAKE_PDF);

    const result = loadExistingHashes(tmpDir, REAL_FS);
    expect(result.has(FAKE_PDF_HASH)).toBe(true);
  });

  it("ignores non-PDF files in month directories", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "notes.txt"), "not a PDF");

    const result = loadExistingHashes(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  describe("collects hashes from PDFs across multiple months", () => {
    it("returns size 2 for two distinct PDFs", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      const otherPdf = Buffer.from("%PDF-different");
      writeFileSync(join(march, "a.pdf"), FAKE_PDF);
      writeFileSync(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(tmpDir, REAL_FS);
      expect(result.size).toBe(2);
    });

    it("includes the hash of the first PDF", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      const otherPdf = Buffer.from("%PDF-different");
      writeFileSync(join(march, "a.pdf"), FAKE_PDF);
      writeFileSync(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(tmpDir, REAL_FS);
      expect(result.has(FAKE_PDF_HASH)).toBe(true);
    });

    it("includes the hash of the second PDF", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      const otherPdf = Buffer.from("%PDF-different");
      writeFileSync(join(march, "a.pdf"), FAKE_PDF);
      writeFileSync(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(tmpDir, REAL_FS);
      expect(result.has(createHash("sha256").update(otherPdf).digest("hex"))).toBe(true);
    });
  });

  describe("calls onError when reading a PDF file fails", () => {
    it("calls the onError callback when readBuffer throws", () => {
      const errors = [];
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "invoice.pdf"), FAKE_PDF);

      const throwingFs = {
        exists: (p) => REAL_FS.exists(p),
        readdir: (p) => REAL_FS.readdir(p),
        readBuffer: () => {
          throw new Error("disk error");
        },
      };

      loadExistingHashes(tmpDir, /** @type {any} */ (throwingFs), (err, ctx) => errors.push({ err, ctx }));
      expect(errors.length).toBe(1);
    });

    it("passes the full Error object to onError", () => {
      const errors = [];
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "invoice.pdf"), FAKE_PDF);

      const throwingFs = {
        exists: (p) => REAL_FS.exists(p),
        readdir: (p) => REAL_FS.readdir(p),
        readBuffer: () => {
          throw new Error("disk error");
        },
      };

      loadExistingHashes(tmpDir, /** @type {any} */ (throwingFs), (err, ctx) => errors.push({ err, ctx }));
      expect(errors[0].err.message).toBe("disk error");
    });
  });
});

// ── uniqueBaseName ────────────────────────────────────────────────────────────

describe("uniqueBaseName", () => {
  it("returns the base name when no conflicts exist", () => {
    const usedPaths = new Set();
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001");
  });

  it("adds the name to usedPaths after returning it", () => {
    const usedPaths = new Set();
    uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(usedPaths.size).toBe(1);
  });

  it("appends _2 when the base name is already in usedPaths", () => {
    const usedPaths = new Set([`${tmpDir}/acme-inv001`]);
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_2");
  });

  it("appends _3 when both base and _2 are already taken", () => {
    const usedPaths = new Set([`${tmpDir}/acme-inv001`, `${tmpDir}/acme-inv001_2`]);
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_3");
  });

  it("appends _2 when a .json file with base name already exists on disk", () => {
    writeFileSync(join(tmpDir, "Acme-INV001.json"), "{}");
    const usedPaths = new Set();
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_2");
  });

  it("appends _2 when a .pdf file with base name already exists on disk", () => {
    writeFileSync(join(tmpDir, "Acme-INV001.pdf"), FAKE_PDF);
    const usedPaths = new Set();
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_2");
  });
});

// ── collectSidecarFiles ───────────────────────────────────────────────────────

describe("collectSidecarFiles", () => {
  it("returns an empty array when the output directory does not exist", () => {
    const result = collectSidecarFiles("/does/not/exist", REAL_FS);
    expect(result).toHaveLength(0);
  });

  describe("finds JSON sidecars in year/month subdirectories", () => {
    it("returns one sidecar file", () => {
      const monthDir = join(tmpDir, "2026", "01");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "Stripe-INV-123.json"), JSON.stringify({ vendor: "Stripe", date: "2026-01-15" }));
      const result = collectSidecarFiles(tmpDir, REAL_FS);
      expect(result).toHaveLength(1);
    });

    it("sidecar has the correct vendor", () => {
      const monthDir = join(tmpDir, "2026", "01");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "Stripe-INV-123.json"), JSON.stringify({ vendor: "Stripe", date: "2026-01-15" }));
      const result = collectSidecarFiles(tmpDir, REAL_FS);
      expect(result[0].sidecar.vendor).toBe("Stripe");
    });
  });
});

// ── receiptMonthDir ───────────────────────────────────────────────────────────

describe("receiptMonthDir", () => {
  it("returns correct path for a Date object", () => {
    const result = receiptMonthDir("/output", new Date("2026-03-15"));
    expect(result).toBe(join("/output", "2026", "03"));
  });

  it("returns correct path for a date string", () => {
    const result = receiptMonthDir("/output", "2025-11-07");
    expect(result).toBe(join("/output", "2025", "11"));
  });

  it("zero-pads single-digit months", () => {
    const result = receiptMonthDir("/output", new Date("2026-01-01"));
    expect(result.endsWith(join("2026", "01"))).toBe(true);
  });

  it("handles December (month 12) without padding", () => {
    const result = receiptMonthDir("/output", new Date("2025-12-25"));
    expect(result.endsWith(join("2025", "12"))).toBe(true);
  });
});

// ── deriveReceiptBaseName ─────────────────────────────────────────────────────

const BASE_MSG = { fromAddress: "billing@acme.com", fromName: "Acme" };

describe("deriveReceiptBaseName", () => {
  it("uses invoice_number in the base name when present", () => {
    const metadata = { invoice_number: "INV-001", date: "2026-01-15" };
    const { rawBase } = deriveReceiptBaseName(metadata, BASE_MSG, "", "Invoice #INV-001");
    expect(rawBase).toContain("INV-001");
  });

  it("falls back to date when invoice_number is absent", () => {
    const metadata = { invoice_number: null, date: "2026-01-15" };
    const { rawBase } = deriveReceiptBaseName(metadata, BASE_MSG, "", "Payment confirmation");
    expect(rawBase).toContain("2026-01-15");
  });

  it("sanitizes illegal characters in invoice_number", () => {
    const metadata = { invoice_number: "INV/001:bad", date: "2026-01-15" };
    const { rawBase } = deriveReceiptBaseName(metadata, BASE_MSG, "", "Invoice");
    expect(rawBase).not.toMatch(/[/:]/);
  });

  it("truncates rawBase longer than 60 characters", () => {
    const metadata = { invoice_number: "A".repeat(70), date: "2026-01-15" };
    const { rawBase } = deriveReceiptBaseName(metadata, BASE_MSG, "", "Invoice");
    expect(rawBase.length).toBeLessThanOrEqual(60);
  });

  it("also returns vendorClean", () => {
    const metadata = { invoice_number: "INV-001", date: "2026-01-15" };
    const { vendorClean } = deriveReceiptBaseName(metadata, BASE_MSG, "", "Invoice");

    expect(vendorClean.length).toBeGreaterThan(0);
  });
});

// ── planReceiptWrite ──────────────────────────────────────────────────────────

const PLAN_PDF_CONTENT = Buffer.from("%PDF-1.4 test content");
const PLAN_PDF_HASH = createHash("sha256").update(PLAN_PDF_CONTENT).digest("hex");

describe("planReceiptWrite", () => {
  const BASE_PARAMS = {
    metadata: { vendor: "Stripe", date: "2026-01-15", invoice_number: "INV-001", amount: 49 },
    baseName: "Stripe-INV-001",
    monthDir: "/output/2026/01",
    existingHashes: new Set(),
    vendorClean: "Stripe",
  };

  it("returns action duplicate when content hash matches existing", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [{ content: PLAN_PDF_CONTENT }],
      existingHashes: new Set([PLAN_PDF_HASH]),
    });
    expect(plan.action).toBe("duplicate");
  });

  it("includes dupLabel in duplicate plan", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [{ content: PLAN_PDF_CONTENT }],
      existingHashes: new Set([PLAN_PDF_HASH]),
    });
    expect(plan.dupLabel).toBeDefined();
  });

  it("returns action downloaded for a new PDF attachment", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [{ content: PLAN_PDF_CONTENT }],
    });
    expect(plan.action).toBe("downloaded");
  });

  describe("downloaded plan includes both .pdf and .json writes", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [{ content: PLAN_PDF_CONTENT }],
    });
    const paths = (plan.writes ?? []).map((w) => w.path);
    it("includes a .pdf write", () => expect(paths.some((p) => p.endsWith(".pdf"))).toBe(true));
    it("includes a .json write", () => expect(paths.some((p) => p.endsWith(".json"))).toBe(true));
  });

  it("downloaded plan sets receipt_file in metadata", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [{ content: PLAN_PDF_CONTENT }],
    });
    expect(plan.metadata.receipt_file).toMatch(/\.pdf$/);
  });

  it("returns action noPdf when no PDF attachments", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [],
    });
    expect(plan.action).toBe("noPdf");
  });

  it("noPdf plan includes only .json write", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [],
    });

    expect(plan.writes).toMatchObject([{ path: expect.stringMatching(/\.json$/) }]);
  });

  it("noPdf plan sets receipt_file to null in metadata", () => {
    const plan = planReceiptWrite({
      ...BASE_PARAMS,
      pdfAttachments: [],
    });
    expect(plan.metadata.receipt_file).toBeNull();
  });
});
