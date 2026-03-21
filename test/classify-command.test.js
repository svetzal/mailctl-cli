import { describe, it, expect, mock } from "bun:test";
import { classifyCommand } from "../src/classify-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSenders() {
  return [
    { address: "vendor@amazon.com", name: "Amazon", count: 5, accounts: ["iCloud"], sampleSubjects: ["Your order"] },
    { address: "receipt@stripe.com", name: "Stripe", count: 2, accounts: ["Gmail"], sampleSubjects: ["Payment receipt"] },
    { address: "noreply@netflix.com", name: "Netflix", count: 12, accounts: ["iCloud"], sampleSubjects: ["Your Netflix invoice"] },
  ];
}

function makeDeps(overrides = {}) {
  const senders = makeSenders();
  const classifications = { "vendor@amazon.com": "business" }; // Amazon already classified

  const fsGateway = {
    exists: mock((path) => path.includes("senders")),  // senders.json exists, classifications.json doesn't
    readJson: mock((path) => {
      if (path.includes("senders")) return senders;
      return classifications;
    }),
  };

  return {
    fsGateway,
    ...overrides,
  };
}

// ── classifyCommand ────────────────────────────────────────────────────────────

describe("classifyCommand", () => {
  it("throws when input file does not exist", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => false),
        readJson: mock(() => []),
      },
    });

    expect(() => classifyCommand("/data/senders.json", "/data/classifications.json", deps)).toThrow(
      "Run 'scan' first to generate sender data."
    );
  });

  it("returns unclassifiedList with all senders when no classifications file exists", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock((path) => path.includes("senders")), // only senders.json exists
        readJson: mock(() => makeSenders()),
      },
    });

    const { unclassifiedList } = classifyCommand("/data/senders.json", "/data/classifications.json", deps);

    expect(unclassifiedList).toHaveLength(3);
  });

  it("excludes already-classified senders from unclassifiedList", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => true), // both files exist
        readJson: mock((path) => {
          if (path.includes("senders")) return makeSenders();
          return { "vendor@amazon.com": "business" }; // Amazon is classified
        }),
      },
    });

    const { unclassifiedList } = classifyCommand("/data/senders.json", "/data/classifications.json", deps);

    expect(unclassifiedList).toHaveLength(2);
    const addresses = unclassifiedList.map((s) => s.address);
    expect(addresses).not.toContain("vendor@amazon.com");
  });

  it("sets classification to null for all entries in unclassifiedList", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock((path) => path.includes("senders")),
        readJson: mock(() => makeSenders()),
      },
    });

    const { unclassifiedList } = classifyCommand("/data/senders.json", "/data/classifications.json", deps);

    for (const entry of unclassifiedList) {
      expect(entry.classification).toBeNull();
    }
  });

  it("includes correct fields in each unclassifiedList entry", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock((path) => path.includes("senders")),
        readJson: mock(() => makeSenders()),
      },
    });

    const { unclassifiedList } = classifyCommand("/data/senders.json", "/data/classifications.json", deps);
    const entry = unclassifiedList[0];

    expect(entry.address).toBeDefined();
    expect(entry.name).toBeDefined();
    expect(entry.count).toBeDefined();
    expect(entry.accounts).toBeDefined();
    expect(entry.example).toBeDefined();
  });

  it("uses first sampleSubject as example", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock((path) => path.includes("senders")),
        readJson: mock(() => [
          { address: "a@b.com", name: "A", count: 1, accounts: [], sampleSubjects: ["First subject", "Second"] },
        ]),
      },
    });

    const { unclassifiedList } = classifyCommand("/data/senders.json", "/data/cls.json", deps);

    expect(unclassifiedList[0].example).toBe("First subject");
  });

  it("uses empty string as example when sampleSubjects is empty", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock((path) => path.includes("senders")),
        readJson: mock(() => [
          { address: "a@b.com", name: "A", count: 1, accounts: [], sampleSubjects: [] },
        ]),
      },
    });

    const { unclassifiedList } = classifyCommand("/data/senders.json", "/data/cls.json", deps);

    expect(unclassifiedList[0].example).toBe("");
  });
});
