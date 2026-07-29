import assert from "node:assert/strict";
import test from "node:test";
import {
  chatGptLoginStartParams,
  logoutAccount,
  validateChatGptLoginResponse,
} from "../src/main/auth-protocol.mjs";

test("ChatGPT login uses the expected hosted Codex flow", () => {
  assert.deepEqual(chatGptLoginStartParams(), {
    type: "chatgpt",
    codexStreamlinedLogin: true,
    useHostedLoginSuccessPage: true,
    appBrand: "codex",
  });
  assert.deepEqual(validateChatGptLoginResponse({
    type: "chatgpt",
    loginId: "login-1",
    authUrl: "https://auth.example.test/start",
  }), {
    loginId: "login-1",
    authUrl: "https://auth.example.test/start",
  });
});

test("ChatGPT login rejects unexpected, insecure, or incomplete responses", () => {
  assert.throws(() => validateChatGptLoginResponse({
    type: "apiKey",
    loginId: "login-1",
    authUrl: "https://auth.example.test/start",
  }), /unexpected login method/);
  assert.throws(() => validateChatGptLoginResponse({
    type: "chatgpt",
    loginId: "login-1",
    authUrl: "http://auth.example.test/start",
  }), /invalid login URL/);
  assert.throws(() => validateChatGptLoginResponse({
    type: "chatgpt",
    authUrl: "https://auth.example.test/start",
  }), /invalid login identifier/);
  assert.throws(() => validateChatGptLoginResponse({
    type: "chatgpt",
    loginId: "login-1",
    authUrl: "not a URL",
  }), /invalid login URL/);
});

test("logout completes before the account is refreshed", async () => {
  const calls = [];
  const account = { account: null };
  const client = {
    async request(method, params) {
      calls.push([method, params]);
      return method === "account/read" ? account : {};
    },
  };

  assert.equal(await logoutAccount(client), account);
  assert.deepEqual(calls, [
    ["account/logout", undefined],
    ["account/read", { refreshToken: false }],
  ]);
});
