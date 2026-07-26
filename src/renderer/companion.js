const api = window.codexDesktop;
const input = document.querySelector("#quickInput");
const send = document.querySelector("#quickSend");
const context = document.querySelector("#context");
const shortcutLabel = document.querySelector("#shortcutLabel");
const hint = document.querySelector("#hint");

async function refresh() {
  const result = await api.companionContext();
  const active = result.thread;
  context.textContent = active ? `${active.title} · ${active.cwd}` : "Choose a project after sending";
  shortcutLabel.textContent = (result.shortcut || "Quick prompt").replace("CommandOrControl", "Ctrl").replaceAll("+", " ");
  requestAnimationFrame(() => input.focus());
}

async function submit() {
  const text = input.value.trim();
  if (!text) return;
  send.disabled = true; hint.textContent = "Sending…";
  try {
    const result = await api.companionSubmit(text);
    if (result.submitted || result.needsProject) input.value = "";
    hint.textContent = result.needsProject ? "Choose a project in the main window" : "Sent to Codex";
  } catch (error) {
    hint.textContent = error.message;
  } finally { send.disabled = !input.value.trim(); }
}

input.addEventListener("input", () => { send.disabled = !input.value.trim(); });
input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } });
document.querySelector("#quickForm").addEventListener("submit", (event) => { event.preventDefault(); submit(); });
api.onCompanionFocus(refresh);
refresh();
