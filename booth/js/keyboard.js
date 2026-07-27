/**
 * Touch-friendly on-screen keyboard for kiosk email entry.
 */
const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "@"],
  ["z", "x", "c", "v", "b", "n", "m", ".", "_", "-"],
];

const SHORTCUTS = ["@gmail.com", "@outlook.com", ".com"];

export function createTouchKeyboard({ target, onChange } = {}) {
  const root = document.createElement("div");
  root.className = "osk";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "On-screen keyboard");

  const keys = document.createElement("div");
  keys.className = "osk-keys";

  for (const row of ROWS) {
    const rowEl = document.createElement("div");
    rowEl.className = "osk-row";
    for (const key of row) {
      rowEl.appendChild(makeKey(key, () => insert(key)));
    }
    keys.appendChild(rowEl);
  }

  const actions = document.createElement("div");
  actions.className = "osk-row osk-row--actions";
  actions.appendChild(makeKey("space", () => insert(" "), "osk-key--wide"));
  actions.appendChild(makeKey("⌫", () => backspace(), "osk-key--back"));
  actions.appendChild(makeKey("clear", () => clear(), "osk-key--clear"));
  keys.appendChild(actions);

  const shortcuts = document.createElement("div");
  shortcuts.className = "osk-row osk-row--shortcuts";
  for (const text of SHORTCUTS) {
    shortcuts.appendChild(makeKey(text, () => insert(text), "osk-key--shortcut"));
  }
  keys.appendChild(shortcuts);

  root.appendChild(keys);

  function input() {
    return typeof target === "function" ? target() : target;
  }

  function emit() {
    const el = input();
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    onChange?.(el.value);
  }

  function insert(text) {
    const el = input();
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
    el.focus({ preventScroll: true });
    emit();
  }

  function backspace() {
    const el = input();
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start !== end) {
      el.value = `${el.value.slice(0, start)}${el.value.slice(end)}`;
      el.setSelectionRange(start, start);
    } else if (start > 0) {
      el.value = `${el.value.slice(0, start - 1)}${el.value.slice(end)}`;
      el.setSelectionRange(start - 1, start - 1);
    }
    el.focus({ preventScroll: true });
    emit();
  }

  function clear() {
    const el = input();
    if (!el) return;
    el.value = "";
    el.focus({ preventScroll: true });
    emit();
  }

  function makeKey(label, handler, extraClass = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `osk-key ${extraClass}`.trim();
    btn.textContent = label === "space" ? "space" : label;
    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      handler();
    });
    return btn;
  }

  return {
    element: root,
    insert,
    backspace,
    clear,
  };
}
