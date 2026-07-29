import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { CodexClient } from "../src/main/codex-client.mjs";

function fakeProcess() {
  const child = new EventEmitter();
  const messages = [];
  const waiters = [];
  child.stdin = {
    writable: true,
    write(chunk) {
      const message = JSON.parse(chunk.toString().trim());
      const waiter = waiters.shift();
      if (waiter) waiter(message); else messages.push(message);
      return true;
    },
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  child.readMessage = () => messages.length ? Promise.resolve(messages.shift()) : new Promise((resolve) => waiters.push(resolve));
  return child;
}

test("connect performs the app-server initialization handshake", async () => {
  const child = fakeProcess();
  const client = new CodexClient({ clientVersion: "0.5.0", spawnProcess: () => child, requestTimeoutMs: 500 });
  const connected = client.connect();
  const initialize = await child.readMessage();
  assert.equal(initialize.method, "initialize");
  assert.equal(initialize.params.clientInfo.name, "codex_linux_community");
  assert.equal(initialize.params.clientInfo.version, "0.5.0");
  child.stdout.write(`${JSON.stringify({ id: initialize.id, result: { platformOs: "linux" } })}\n`);
  await connected;
  assert.equal(client.ready, true);
  assert.deepEqual(client.serverInfo, { platformOs: "linux" });
  const initialized = await child.readMessage();
  assert.deepEqual(initialized, { method: "initialized" });
  client.close();
});

test("request resolves matching responses and forwards events", async () => {
  const child = fakeProcess();
  const client = new CodexClient({ spawnProcess: () => child, requestTimeoutMs: 500 });
  client.process = child;

  const pending = client.request("thread/list", { limit: 10 });
  const outgoing = await child.readMessage();
  client.handleLine(JSON.stringify({ id: outgoing.id, result: { data: [] } }));
  assert.deepEqual(await pending, { data: [] });

  const notificationPromise = once(client, "notification");
  client.handleLine(JSON.stringify({ method: "turn/started", params: { turn: { id: "turn-1" } } }));
  const [notification] = await notificationPromise;
  assert.equal(notification.method, "turn/started");

  const requestPromise = once(client, "serverRequest");
  client.handleLine(JSON.stringify({ id: 77, method: "item/commandExecution/requestApproval", params: {} }));
  const [request] = await requestPromise;
  assert.equal(request.id, 77);
  client.close();
});

test("malformed output is logged without crashing", async () => {
  const client = new CodexClient();
  const logPromise = once(client, "log");
  client.handleLine("not-json");
  const [message] = await logPromise;
  assert.match(message, /Unparseable/);
});

test("reports missing protocol methods with their request name", async () => {
  const child = fakeProcess();
  const client = new CodexClient({ spawnProcess: () => child, requestTimeoutMs: 500 });
  client.process = child;
  const protocolError = once(client, "protocolError");
  const pending = client.request("process/spawn", { command: [] });
  const outgoing = await child.readMessage();
  client.handleLine(JSON.stringify({ id: outgoing.id, error: { code: -32601, message: "Method not found" } }));
  await assert.rejects(pending, /Method not found/);
  assert.deepEqual((await protocolError)[0], { method: "process/spawn", error: "Method not found" });
  client.close();
});
