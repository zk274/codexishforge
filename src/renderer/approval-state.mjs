const modernApprovalMethods = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
]);
const legacyApprovalMethods = new Set(["execCommandApproval", "applyPatchApproval"]);

function answer(result, openUrl = null) {
  return { kind: "answer", result, openUrl };
}

function reject(message) {
  return { kind: "reject", message };
}

export function responseForRequest(request, action, values = {}) {
  const method = request?.method;

  if (method === "item/tool/requestUserInput") {
    return action === "deny"
      ? reject("User cancelled the input request")
      : answer({ answers: values.answers || {} });
  }

  if (modernApprovalMethods.has(method)) {
    const decision = action === "allow" ? "accept" : action === "session" ? "acceptForSession" : "decline";
    return answer({ decision });
  }

  if (legacyApprovalMethods.has(method)) {
    const decision = action === "allow" ? "approved" : action === "session" ? "approved_for_session" : "denied";
    return answer({ decision });
  }

  if (method === "item/permissions/requestApproval") {
    if (action === "deny") return reject("User denied the additional permissions");
    const requested = request.params?.permissions || {};
    const permissions = {};
    if (requested.network) permissions.network = requested.network;
    if (requested.fileSystem) permissions.fileSystem = requested.fileSystem;
    return answer({ permissions, scope: action === "session" ? "session" : "turn" });
  }

  if (method === "mcpServer/elicitation/request") {
    if (action === "deny") return answer({ action: "decline", content: null, _meta: null });
    const openUrl = request.params?.mode === "url" ? request.params.url : null;
    return answer({
      action: "accept",
      content: openUrl ? null : (values.content || {}),
      _meta: null,
    }, openUrl);
  }

  return reject(`Unsupported request: ${method}`);
}
