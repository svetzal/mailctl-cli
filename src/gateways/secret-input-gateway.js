import { StringDecoder } from "node:string_decoder";

const MAX_SECRET_INPUT_BYTES = 8 * 1024 * 1024;

export class SecretInputGateway {
  isTerminal() {
    return Boolean(process.stdin.isTTY);
  }

  /** @returns {Promise<string>} */
  async readStdin() {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > MAX_SECRET_INPUT_BYTES) throw new Error("Secret input exceeds size limit.");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  /** @returns {Promise<string>} */
  async prompt() {
    if (!this.isTerminal()) throw new Error("Use --stdin for piped secret input.");
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stderr.write("Secret (input hidden): ");
    process.stdin.resume();
    try {
      return await new Promise((resolve, reject) => {
        let value = "";
        const decoder = new StringDecoder("utf8");
        const read = (/** @type {Buffer} */ chunk) => {
          for (const character of decoder.write(chunk)) {
            if (character === "\r" || character === "\n" || character === "\u0003" || character === "\u0004") {
              process.stdin.off("data", read);
              if (character === "\u0003" || character === "\u0004") reject(new Error("Secret input cancelled."));
              else resolve(value);
              return;
            }
            if (character === "\u007f") value = value.slice(0, -1);
            else value += character;
          }
        };
        process.stdin.on("data", read);
      });
    } finally {
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stderr.write("\n");
    }
  }
}
