import { afterEach, describe, expect, it, mock } from "bun:test";

function makeGateway(questionFn) {
  mock.module("node:readline", () => ({
    createInterface: () => ({
      question: questionFn,
      close: () => {},
    }),
  }));
  const { ConfirmGateway } = require("../../src/gateways/confirm-gateway.js");
  return new ConfirmGateway();
}

afterEach(() => {
  mock.restore();
});

describe("ConfirmGateway confirm", () => {
  it("resolves to the answer string returned by question", async () => {
    const gateway = makeGateway((_prompt, cb) => cb("yes"));

    const result = await gateway.confirm("Continue? ");

    expect(result).toBe("yes");
  });

  it("passes the supplied prompt to question", async () => {
    let capturedPrompt = "";
    const gateway = makeGateway((prompt, cb) => {
      capturedPrompt = prompt;
      cb("");
    });

    await gateway.confirm("Are you sure? [y/N] ");

    expect(capturedPrompt).toBe("Are you sure? [y/N] ");
  });
});
