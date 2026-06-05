import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { debug } from "../src/debug.js";

describe("debug", () => {
  let savedDebug;
  let consoleSpy;

  afterEach(() => {
    consoleSpy?.mockRestore();
    consoleSpy = undefined;
    if (savedDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = savedDebug;
    }
    savedDebug = undefined;
  });

  it("writes a tagged message to console.error when DEBUG=mailctl", () => {
    savedDebug = process.env.DEBUG;
    process.env.DEBUG = "mailctl";
    consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    debug("ctx", "msg");

    expect(consoleSpy).toHaveBeenCalledWith("[mailctl:ctx] msg");
  });

  it("does not call console.error when DEBUG is not mailctl", () => {
    savedDebug = process.env.DEBUG;
    delete process.env.DEBUG;
    consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    debug("ctx", "msg");

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("passes the error object as the second console.error argument when err is provided", () => {
    savedDebug = process.env.DEBUG;
    process.env.DEBUG = "mailctl";
    consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("oops");

    debug("ctx", "msg", err);

    expect(consoleSpy).toHaveBeenCalledWith("[mailctl:ctx] msg", err);
  });
});
