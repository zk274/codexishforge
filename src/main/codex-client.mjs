import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export class CodexClient extends EventEmitter {
  constructor({ command = "codex", clientVersion = "0.0.0", spawnProcess = spawn, requestTimeoutMs = 30_000 } = {}) {
    super();
    this.command = command;
    this.clientVersion = clientVersion;
    this.spawnProcess = spawnProcess;
    this.requestTimeoutMs = requestTimeoutMs;
    this.process = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.serverInfo = null;
  }

  async connect() {
    if (this.ready) return;
    if (this.process) throw new Error("Codex app-server is already starting");

    this.process = this.spawnProcess(this.command, ["app-server", "--stdio"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    createInterface({ input: this.process.stdout }).on("line", (line) => this.handleLine(line));
    this.process.stderr.on("data", (chunk) => this.emit("log", chunk.toString()));
    this.process.once("error", (error) => this.handleExit(error));
    this.process.once("exit", (code, signal) => {
      this.handleExit(new Error(`Codex app-server exited (${signal || code || "unknown"})`));
    });

    this.serverInfo = await this.request("initialize", {
      clientInfo: { name: "codex_linux_community", title: "Codex Linux Community", version: this.clientVersion },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        mcpServerOpenaiFormElicitation: false,
      },
    });
    this.notify("initialized");
    this.ready = true;
    this.emit("status", { connected: true, serverInfo: this.serverInfo });
  }

  request(method, params) {
    if (!this.process?.stdin?.writable) return Promise.reject(new Error("Codex app-server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.write({ method, id, params });
    });
  }

  notify(method, params) {
    this.write(params === undefined ? { method } : { method, params });
  }

  respond(id, result) {
    this.write({ id, result });
  }

  reject(id, code, message) {
    this.write({ id, error: { code, message } });
  }

  write(message) {
    if (!this.process?.stdin?.writable) throw new Error("Codex app-server is not running");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit("log", `Unparseable app-server output: ${line}`);
      return;
    }

    if (Object.hasOwn(message, "id") && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.message || "Codex request failed");
        error.code = message.error.code;
        error.method = pending.method;
        if (message.error.code === -32601) this.emit("protocolError", { method: pending.method, error: error.message });
        pending.reject(error);
      } else pending.resolve(message.result);
      return;
    }

    if (message.method && Object.hasOwn(message, "id")) {
      this.emit("serverRequest", message);
      return;
    }
    if (message.method) this.emit("notification", message);
  }

  handleExit(error) {
    if (!this.process && !this.pending.size) return;
    this.ready = false;
    this.serverInfo = null;
    this.process = null;
    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.pending.clear();
    this.emit("status", { connected: false, error: error.message });
  }

  close() {
    const child = this.process;
    this.process = null;
    this.ready = false;
    if (child && !child.killed) child.kill("SIGTERM");
  }
}
