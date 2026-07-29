export const CODEX_APPROVAL_POLICY = "on-request";
export const CODEX_APPROVALS_REVIEWER = "user";
export const CODEX_THREAD_SANDBOX = "workspace-write";

export function secureThreadExecutionParams(params = {}) {
  const {
    approvalPolicy: _approvalPolicy,
    approvalsReviewer: _approvalsReviewer,
    permissions: _permissions,
    sandbox: _sandbox,
    ...safeParams
  } = params;
  return {
    ...safeParams,
    approvalPolicy: CODEX_APPROVAL_POLICY,
    approvalsReviewer: CODEX_APPROVALS_REVIEWER,
    sandbox: CODEX_THREAD_SANDBOX,
  };
}

export function secureTurnExecutionParams(params = {}) {
  const {
    approvalPolicy: _approvalPolicy,
    approvalsReviewer: _approvalsReviewer,
    permissions: _permissions,
    sandboxPolicy: _sandboxPolicy,
    ...safeParams
  } = params;
  return {
    ...safeParams,
    approvalPolicy: CODEX_APPROVAL_POLICY,
    approvalsReviewer: CODEX_APPROVALS_REVIEWER,
    sandboxPolicy: { type: "workspaceWrite" },
  };
}
