import { describe, expect, it } from "bun:test";
import { makeFakeFs } from "./fake-fs.js";

describe("makeFakeFs", () => {
  it("registers intermediate directories on nested mkdir", () => {
    const fs = makeFakeFs();
    fs.mkdir("/root/2025/03");
    expect(fs.exists("/root/2025")).toBe(true);
  });

  it("registers ancestor directories when writing a file", () => {
    const fs = makeFakeFs();
    fs.writeFile("/root/2025/03/a.pdf", "pdf");
    expect(fs.readdir("/root/2025")).toEqual(["03"]);
  });

  it("lists only immediate children of the root", () => {
    const fs = makeFakeFs();
    fs.writeFile("/root/2025/03/a.pdf", "pdf");
    fs.mkdir("/root/2024");
    expect(fs.readdir("/root")).toEqual(["2024", "2025"]);
  });

  it("lists files in a leaf directory", () => {
    const fs = makeFakeFs();
    fs.writeFile("/root/2025/03/a.pdf", "pdf");
    fs.writeFile("/root/2025/03/a.json", "{}");
    expect(fs.readdir("/root/2025/03")).toEqual(["a.json", "a.pdf"]);
  });

  it("throws ENOENT when reading an unknown directory", () => {
    const fs = makeFakeFs();
    expect(() => fs.readdir("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("throws when reading a missing file buffer", () => {
    const fs = makeFakeFs();
    expect(() => fs.readBuffer("/missing.pdf")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("round-trips written JSON", () => {
    const fs = makeFakeFs();
    fs.writeJson("/root/a.json", { invoice_number: "INV-1" });
    expect(fs.readJson("/root/a.json")).toEqual({ invoice_number: "INV-1" });
  });

  it("throws on malformed JSON", () => {
    const fs = makeFakeFs();
    fs.writeFile("/root/bad.json", "{not json");
    expect(() => fs.readJson("/root/bad.json")).toThrow(SyntaxError);
  });

  it("removes a directory and everything under it with recursive rm", () => {
    const fs = makeFakeFs();
    fs.writeFile("/root/2025/03/a.pdf", "pdf");
    fs.rm("/root/2025", { recursive: true });
    expect(fs.exists("/root/2025/03/a.pdf")).toBe(false);
  });

  it("keeps siblings when removing a directory recursively", () => {
    const fs = makeFakeFs();
    fs.writeFile("/root/2025/03/a.pdf", "pdf");
    fs.mkdir("/root/2024");
    fs.rm("/root/2025", { recursive: true });
    expect(fs.readdir("/root")).toEqual(["2024"]);
  });
});
