import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  collectSidecarFiles,
  deriveReceiptBaseName,
  loadExistingHashes,
  loadExistingInvoiceNumbers,
  planReceiptWrite,
  receiptMonthDir,
  uniqueBaseName,
  walkOutputTree,
} from "../src/receipts/receipt-output-tree.js";
import { ValidationError } from "../src/validate-json.js";
import { makeFakeFs } from "./fake-fs.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const ROOT = "/receipts";
const FAKE_PDF = Buffer.from("%PDF-1.4 fake content for tests");
const FAKE_PDF_HASH = createHash("sha256").update(FAKE_PDF).digest("hex");

/** @type {ReturnType<typeof makeFakeFs>} */
let fs;

beforeEach(() => {
  fs = makeFakeFs();
  fs.mkdir(ROOT);
});

// ── walkOutputTree ────────────────────────────────────────────────────────────

describe("walkOutputTree", () => {
  it("does nothing when the output directory does not exist", () => {
    const visitor = mock(() => {});
    walkOutputTree("/does/not/exist", fs, visitor);
    expect(visitor).not.toHaveBeenCalled();
  });

  describe("visits files in year/month subdirectories", () => {
    it("visits exactly one file", () => {
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(ROOT, fs, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited).toHaveLength(1);
    });

    it("visited file has correct fileName", () => {
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(ROOT, fs, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited[0].fileName).toBe("receipt.json");
    });

    it("visited file has correct filePath", () => {
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(ROOT, fs, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited[0].filePath).toBe(join(monthDir, "receipt.json"));
    });
  });

  it("skips non-year top-level directories", () => {
    const badDir = join(ROOT, "not-a-year");
    fs.mkdir(badDir);
    fs.writeFile(join(badDir, "file.txt"), "data");

    const visitor = mock(() => {});
    walkOutputTree(ROOT, fs, visitor);
    expect(visitor).not.toHaveBeenCalled();
  });

  describe("visits files across multiple years and months", () => {
    it("visits two files", () => {
      fs.mkdir(join(ROOT, "2024", "12"));
      fs.mkdir(join(ROOT, "2025", "01"));
      fs.writeFile(join(ROOT, "2024", "12", "a.pdf"), "pdf1");
      fs.writeFile(join(ROOT, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(ROOT, fs, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toHaveLength(2);
    });

    it("visits a.pdf from 2024", () => {
      fs.mkdir(join(ROOT, "2024", "12"));
      fs.mkdir(join(ROOT, "2025", "01"));
      fs.writeFile(join(ROOT, "2024", "12", "a.pdf"), "pdf1");
      fs.writeFile(join(ROOT, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(ROOT, fs, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toContain("a.pdf");
    });

    it("visits b.json from 2025", () => {
      fs.mkdir(join(ROOT, "2024", "12"));
      fs.mkdir(join(ROOT, "2025", "01"));
      fs.writeFile(join(ROOT, "2024", "12", "a.pdf"), "pdf1");
      fs.writeFile(join(ROOT, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(ROOT, fs, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toContain("b.json");
    });
  });

  describe("continues past files that cause visitor errors (default no-op onError)", () => {
    it("still visits good.json after bad.json throws", () => {
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "good.json"), "{}");
      fs.writeFile(join(monthDir, "bad.json"), "{}");
      const visited = [];
      walkOutputTree(ROOT, fs, (_filePath, fileName) => {
        if (fileName === "bad.json") throw new Error("intentional");
        visited.push(fileName);
      });
      expect(visited).toContain("good.json");
    });

    it("does not include bad.json in visited list", () => {
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "good.json"), "{}");
      fs.writeFile(join(monthDir, "bad.json"), "{}");
      const visited = [];
      walkOutputTree(ROOT, fs, (_filePath, fileName) => {
        if (fileName === "bad.json") throw new Error("intentional");
        visited.push(fileName);
      });
      expect(visited).not.toContain("bad.json");
    });
  });

  describe("calls onError with the error and file context when visitor throws", () => {
    it("calls onError once", () => {
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        ROOT,
        fs,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors).toHaveLength(1);
    });

    it("passes the error message to onError", () => {
      const monthDir2 = join(ROOT, "2025", "03");
      fs.mkdir(monthDir2);
      fs.writeFile(join(monthDir2, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        ROOT,
        fs,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors[0].err.message).toBe("visitor-fail");
    });

    it("passes ctx.level as file to onError", () => {
      const monthDir3 = join(ROOT, "2025", "03");
      fs.mkdir(monthDir3);
      fs.writeFile(join(monthDir3, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        ROOT,
        fs,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors[0].ctx.level).toBe("file");
    });

    it("passes ctx.op as visitor to onError when visitor throws", () => {
      const monthDir4 = join(ROOT, "2025", "03");
      fs.mkdir(monthDir4);
      fs.writeFile(join(monthDir4, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        ROOT,
        fs,
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
      const yearPath = join(ROOT, "2025");
      fs.mkdir(join(yearPath, "03"));
      fs.mkdir(join(yearPath, "04"));
      fs.writeFile(join(yearPath, "04", "receipt.json"), "{}");

      const errors = [];
      const mockFs = {
        exists: () => true,
        readdir: (p) => {
          if (p === join(yearPath, "03")) throw new Error("readdir failed");
          return fs.readdir(p);
        },
      };

      const visited = [];
      walkOutputTree(
        ROOT,
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
    const result = loadExistingInvoiceNumbers("/does/not/exist", fs);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set for an empty directory", () => {
    const result = loadExistingInvoiceNumbers(ROOT, fs);
    expect(result.size).toBe(0);
  });

  it("extracts invoice numbers from JSON sidecars in year/month subdirectories", () => {
    const monthDir = join(ROOT, "2025", "03");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "receipt.json"), JSON.stringify({ invoice_number: "INV-001" }));

    const result = loadExistingInvoiceNumbers(ROOT, fs);
    expect(result.has("INV-001")).toBe(true);
  });

  it("ignores non-year top-level directories", () => {
    const badDir = join(ROOT, "not-a-year");
    fs.mkdir(badDir);
    fs.writeFile(join(badDir, "some.json"), JSON.stringify({ invoice_number: "SKIP-ME" }));

    const result = loadExistingInvoiceNumbers(ROOT, fs);
    expect(result.size).toBe(0);
  });

  it("ignores JSON files without an invoice_number field", () => {
    const monthDir = join(ROOT, "2025", "03");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "no-invoice.json"), JSON.stringify({ vendor: "Acme" }));

    const result = loadExistingInvoiceNumbers(ROOT, fs);
    expect(result.size).toBe(0);
  });

  describe("collects invoice numbers from multiple months", () => {
    it("includes INV-001 from march", () => {
      const march = join(ROOT, "2025", "03");
      const april = join(ROOT, "2025", "04");
      fs.mkdir(march);
      fs.mkdir(april);
      fs.writeFile(join(march, "a.json"), JSON.stringify({ invoice_number: "INV-001" }));
      fs.writeFile(join(april, "b.json"), JSON.stringify({ invoice_number: "INV-002" }));

      const result = loadExistingInvoiceNumbers(ROOT, fs);
      expect(result.has("INV-001")).toBe(true);
    });

    it("includes INV-002 from april", () => {
      const march = join(ROOT, "2025", "03");
      const april = join(ROOT, "2025", "04");
      fs.mkdir(march);
      fs.mkdir(april);
      fs.writeFile(join(march, "a.json"), JSON.stringify({ invoice_number: "INV-001" }));
      fs.writeFile(join(april, "b.json"), JSON.stringify({ invoice_number: "INV-002" }));

      const result = loadExistingInvoiceNumbers(ROOT, fs);
      expect(result.has("INV-002")).toBe(true);
    });
  });

  it("ignores non-json files in month directories", () => {
    const monthDir = join(ROOT, "2025", "03");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "receipt.pdf"), FAKE_PDF);

    const result = loadExistingInvoiceNumbers(ROOT, fs);
    expect(result.size).toBe(0);
  });

  describe("calls onError when reading a JSON sidecar file fails", () => {
    it("calls the onError callback when readJson throws", () => {
      const errors = [];
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "bad.json"), "not valid json");

      loadExistingInvoiceNumbers(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it("passes the full Error object to onError", () => {
      const errors = [];
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "bad.json"), "not valid json");

      loadExistingInvoiceNumbers(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));
      expect(errors[0].err).toBeInstanceOf(Error);
    });
  });
});

// ── loadExistingHashes ────────────────────────────────────────────────────────

describe("loadExistingHashes", () => {
  it("returns an empty Set when the output directory does not exist", () => {
    const result = loadExistingHashes("/does/not/exist", fs);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set for an empty directory", () => {
    const result = loadExistingHashes(ROOT, fs);
    expect(result.size).toBe(0);
  });

  it("returns the SHA-256 hash of a PDF in a year/month subdirectory", () => {
    const monthDir = join(ROOT, "2025", "03");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "invoice.pdf"), FAKE_PDF);

    const result = loadExistingHashes(ROOT, fs);
    expect(result.has(FAKE_PDF_HASH)).toBe(true);
  });

  it("ignores non-PDF files in month directories", () => {
    const monthDir = join(ROOT, "2025", "03");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "notes.txt"), "not a PDF");

    const result = loadExistingHashes(ROOT, fs);
    expect(result.size).toBe(0);
  });

  describe("collects hashes from PDFs across multiple months", () => {
    it("returns size 2 for two distinct PDFs", () => {
      const march = join(ROOT, "2025", "03");
      const april = join(ROOT, "2025", "04");
      fs.mkdir(march);
      fs.mkdir(april);
      const otherPdf = Buffer.from("%PDF-different");
      fs.writeFile(join(march, "a.pdf"), FAKE_PDF);
      fs.writeFile(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(ROOT, fs);
      expect(result.size).toBe(2);
    });

    it("includes the hash of the first PDF", () => {
      const march = join(ROOT, "2025", "03");
      const april = join(ROOT, "2025", "04");
      fs.mkdir(march);
      fs.mkdir(april);
      const otherPdf = Buffer.from("%PDF-different");
      fs.writeFile(join(march, "a.pdf"), FAKE_PDF);
      fs.writeFile(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(ROOT, fs);
      expect(result.has(FAKE_PDF_HASH)).toBe(true);
    });

    it("includes the hash of the second PDF", () => {
      const march = join(ROOT, "2025", "03");
      const april = join(ROOT, "2025", "04");
      fs.mkdir(march);
      fs.mkdir(april);
      const otherPdf = Buffer.from("%PDF-different");
      fs.writeFile(join(march, "a.pdf"), FAKE_PDF);
      fs.writeFile(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(ROOT, fs);
      expect(result.has(createHash("sha256").update(otherPdf).digest("hex"))).toBe(true);
    });
  });

  describe("calls onError when reading a PDF file fails", () => {
    it("calls the onError callback when readBuffer throws", () => {
      const errors = [];
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "invoice.pdf"), FAKE_PDF);

      const throwingFs = {
        exists: (p) => fs.exists(p),
        readdir: (p) => fs.readdir(p),
        readBuffer: () => {
          throw new Error("disk error");
        },
      };

      loadExistingHashes(ROOT, /** @type {any} */ (throwingFs), (err, ctx) => errors.push({ err, ctx }));
      expect(errors.length).toBe(1);
    });

    it("passes the full Error object to onError", () => {
      const errors = [];
      const monthDir = join(ROOT, "2025", "03");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "invoice.pdf"), FAKE_PDF);

      const throwingFs = {
        exists: (p) => fs.exists(p),
        readdir: (p) => fs.readdir(p),
        readBuffer: () => {
          throw new Error("disk error");
        },
      };

      loadExistingHashes(ROOT, /** @type {any} */ (throwingFs), (err, ctx) => errors.push({ err, ctx }));
      expect(errors[0].err.message).toBe("disk error");
    });
  });
});

// ── uniqueBaseName ────────────────────────────────────────────────────────────

describe("uniqueBaseName", () => {
  it("returns the base name when no conflicts exist", () => {
    const usedPaths = new Set();
    const result = uniqueBaseName(ROOT, "Acme-INV001", usedPaths, fs);
    expect(result).toBe("Acme-INV001");
  });

  it("adds the name to usedPaths after returning it", () => {
    const usedPaths = new Set();
    uniqueBaseName(ROOT, "Acme-INV001", usedPaths, fs);
    expect(usedPaths.size).toBe(1);
  });

  it("appends _2 when the base name is already in usedPaths", () => {
    const usedPaths = new Set([`${ROOT}/acme-inv001`]);
    const result = uniqueBaseName(ROOT, "Acme-INV001", usedPaths, fs);
    expect(result).toBe("Acme-INV001_2");
  });

  it("appends _3 when both base and _2 are already taken", () => {
    const usedPaths = new Set([`${ROOT}/acme-inv001`, `${ROOT}/acme-inv001_2`]);
    const result = uniqueBaseName(ROOT, "Acme-INV001", usedPaths, fs);
    expect(result).toBe("Acme-INV001_3");
  });

  it("appends _2 when a .json file with base name already exists on disk", () => {
    fs.writeFile(join(ROOT, "Acme-INV001.json"), "{}");
    const usedPaths = new Set();
    const result = uniqueBaseName(ROOT, "Acme-INV001", usedPaths, fs);
    expect(result).toBe("Acme-INV001_2");
  });

  it("appends _2 when a .pdf file with base name already exists on disk", () => {
    fs.writeFile(join(ROOT, "Acme-INV001.pdf"), FAKE_PDF);
    const usedPaths = new Set();
    const result = uniqueBaseName(ROOT, "Acme-INV001", usedPaths, fs);
    expect(result).toBe("Acme-INV001_2");
  });
});

// ── collectSidecarFiles ───────────────────────────────────────────────────────

describe("collectSidecarFiles", () => {
  it("returns an empty array when the output directory does not exist", () => {
    const result = collectSidecarFiles("/does/not/exist", fs);
    expect(result).toHaveLength(0);
  });

  describe("finds JSON sidecars in year/month subdirectories", () => {
    it("returns one sidecar file", () => {
      const monthDir = join(ROOT, "2026", "01");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "Stripe-INV-123.json"), JSON.stringify({ vendor: "Stripe", date: "2026-01-15" }));
      const result = collectSidecarFiles(ROOT, fs);
      expect(result).toHaveLength(1);
    });

    it("sidecar has the correct vendor", () => {
      const monthDir = join(ROOT, "2026", "01");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "Stripe-INV-123.json"), JSON.stringify({ vendor: "Stripe", date: "2026-01-15" }));
      const result = collectSidecarFiles(ROOT, fs);
      expect(result[0].sidecar.vendor).toBe("Stripe");
    });
  });

  describe("continues past a malformed sidecar (array instead of object)", () => {
    it("collects the valid sidecar and skips the malformed one", () => {
      const monthDir = join(ROOT, "2026", "02");
      fs.mkdir(monthDir);
      // Malformed sidecar: JSON array instead of object
      fs.writeFile(join(monthDir, "bad.json"), JSON.stringify(["not", "an", "object"]));
      // Valid sidecar
      fs.writeFile(join(monthDir, "good.json"), JSON.stringify({ vendor: "Acme", date: "2026-02-01" }));

      const errors = [];
      const result = collectSidecarFiles(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));

      expect(result).toHaveLength(1);
    });

    it("reports the malformed sidecar via onError with a ValidationError", () => {
      const monthDir = join(ROOT, "2026", "02");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "bad.json"), JSON.stringify(["not", "an", "object"]));
      fs.writeFile(join(monthDir, "good.json"), JSON.stringify({ vendor: "Acme", date: "2026-02-01" }));

      const errors = [];
      collectSidecarFiles(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));

      expect(errors.length).toBe(1);
    });

    it("passes a ValidationError to onError for the malformed sidecar", () => {
      const monthDir = join(ROOT, "2026", "02");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "bad.json"), JSON.stringify(["not", "an", "object"]));
      fs.writeFile(join(monthDir, "good.json"), JSON.stringify({ vendor: "Acme", date: "2026-02-01" }));

      const errors = [];
      collectSidecarFiles(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));

      expect(errors[0].err).toBeInstanceOf(ValidationError);
    });

    it("preserves the valid sidecar's vendor", () => {
      const monthDir = join(ROOT, "2026", "02");
      fs.mkdir(monthDir);
      fs.writeFile(join(monthDir, "bad.json"), JSON.stringify(["not", "an", "object"]));
      fs.writeFile(join(monthDir, "good.json"), JSON.stringify({ vendor: "Acme", date: "2026-02-01" }));

      const errors = [];
      const result = collectSidecarFiles(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));

      expect(result[0].sidecar.vendor).toBe("Acme");
    });
  });
});

// ── loadExistingInvoiceNumbers with malformed sidecar ────────────────────────

describe("loadExistingInvoiceNumbers with a malformed sidecar (array instead of object)", () => {
  it("calls onError for the malformed file", () => {
    const monthDir = join(ROOT, "2026", "02");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "bad.json"), JSON.stringify(["not", "an", "object"]));
    fs.writeFile(join(monthDir, "good.json"), JSON.stringify({ invoice_number: "INV-999" }));

    const errors = [];
    loadExistingInvoiceNumbers(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));

    expect(errors.length).toBe(1);
  });

  it("passes a ValidationError to onError", () => {
    const monthDir = join(ROOT, "2026", "02");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "bad.json"), JSON.stringify(["not", "an", "object"]));
    fs.writeFile(join(monthDir, "good.json"), JSON.stringify({ invoice_number: "INV-999" }));

    const errors = [];
    loadExistingInvoiceNumbers(ROOT, fs, (err, ctx) => errors.push({ err, ctx }));

    expect(errors[0].err).toBeInstanceOf(ValidationError);
  });

  it("still collects invoice numbers from valid sidecars", () => {
    const monthDir = join(ROOT, "2026", "02");
    fs.mkdir(monthDir);
    fs.writeFile(join(monthDir, "bad.json"), JSON.stringify(["not", "an", "object"]));
    fs.writeFile(join(monthDir, "good.json"), JSON.stringify({ invoice_number: "INV-999" }));

    const result = loadExistingInvoiceNumbers(ROOT, fs, () => {});

    expect(result.has("INV-999")).toBe(true);
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
    const result = receiptMonthDir("/output", new Date(2026, 0, 1));
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

  it("sanitizes a comma in invoice_number the same way sanitizeFilename sanitizes a comma in a vendor name", () => {
    const metadata = { invoice_number: "INV,001", date: "2026-01-15" };
    const { rawBase } = deriveReceiptBaseName(metadata, BASE_MSG, "", "Invoice");
    expect(rawBase).not.toContain(",");
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
