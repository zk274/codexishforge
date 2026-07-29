export function chatGptLoginStartParams() {
  return {
    type: "chatgpt",
    codexStreamlinedLogin: true,
    useHostedLoginSuccessPage: true,
    appBrand: "codex",
  };
}

export function validateChatGptLoginResponse(response) {
  if (response?.type !== "chatgpt") throw new Error("Codex returned an unexpected login method");
  if (typeof response.loginId !== "string" || !response.loginId.trim()) throw new Error("Codex returned an invalid login identifier");
  let url;
  try {
    if (typeof response.authUrl !== "string") throw new TypeError("Missing login URL");
    url = new URL(response.authUrl);
  } catch {
    throw new Error("Codex returned an invalid login URL");
  }
  if (url.protocol !== "https:") throw new Error("Codex returned an invalid login URL");
  return { loginId: response.loginId, authUrl: url.toString() };
}

export async function logoutAccount(activeClient) {
  await activeClient.request("account/logout");
  return activeClient.request("account/read", { refreshToken: false });
}
