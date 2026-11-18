// Chorus dashboard mention suggestions. While the person types an @ and the
// start of a handle in the message box, a list of the swarm's participants
// whose handle contains what they typed opens above the box. Up and Down
// move through the list, Enter or Tab (or a click) writes the chosen handle
// into the message, and Escape closes the list.
(() => {
  "use strict";

  // MENTION_BEFORE_CARET finds, in the text before the caret, an @ that
  // starts a mention and the handle letters typed after it. An @ in the
  // middle of a word, as in an email address, does not start a mention.
  const MENTION_BEFORE_CARET = /(?:^|[^A-Za-z0-9_-])@([A-Za-z0-9_-]*)$/;

  const messageBox = document.getElementById("send-text");
  const list = document.getElementById("mention-suggestions");

  // shown is null while the list is closed. Open, it holds where the @ sits
  // in the message, the handles listed, and the index of the highlighted one.
  let shown = null;
  // dismissed is where the @ sits of a mention whose list the person closed
  // with Escape, so the list stays closed while they finish typing that
  // handle; -1 otherwise.
  let dismissed = -1;

  // refresh opens, updates, or closes the list to match the text before the
  // caret.
  function refresh() {
    const caret = messageBox.selectionStart;
    const found = messageBox.selectionEnd === caret
      ? MENTION_BEFORE_CARET.exec(messageBox.value.slice(0, caret))
      : null;
    const start = found ? caret - found[1].length - 1 : -1;
    if (start !== dismissed) dismissed = -1;
    const handles = found && start !== dismissed ? matching(found[1]) : [];
    if (handles.length === 0) {
      close();
      return;
    }
    const kept = shown ? handles.indexOf(shown.handles[shown.active]) : -1;
    shown = { start, handles, active: Math.max(kept, 0) };
    draw();
  }

  // matching lists the handles that contain typed, ignoring case: those that
  // start with it first, each group in alphabetical order. The person's own
  // handle is left out. When the message goes to a channel, "all" (everyone
  // in the channel) comes last.
  function matching(typed) {
    const wanted = typed.toLowerCase();
    const me = document.getElementById("send-handle").value.trim().toLowerCase();
    const position = (handle) => handle.toLowerCase().indexOf(wanted);
    const handles = (window.ChorusUI.state.view?.agents || [])
      .map((agent) => agent.handle)
      .filter((handle) => handle.toLowerCase() !== me && position(handle) >= 0)
      .sort((a, b) => (position(a) > 0) - (position(b) > 0) || a.localeCompare(b));
    const toChannel = document.getElementById("send-target").value.trim().startsWith("#");
    if (toChannel && position("all") >= 0) handles.push("all");
    return handles;
  }

  // draw fills the list with one row per handle and highlights the active one.
  function draw() {
    const { el, handleBadge, state } = window.ChorusUI;
    const agents = state.view?.agents || [];
    list.replaceChildren(...shown.handles.map((handle, index) => {
      const agent = agents.find((a) => a.handle === handle);
      return el("li", {
        id: `mention-suggestion-${index}`,
        className: "mention-suggestion",
        role: "option",
        "aria-selected": String(index === shown.active),
        dataset: { handle },
      },
      agent ? handleBadge(handle, agent.model) : `@${handle}`,
      el("span", { className: "mention-suggestion-note" }, agent ? agent.model || "" : "everyone in the channel"));
    }));
    list.hidden = false;
    messageBox.setAttribute("aria-activedescendant", `mention-suggestion-${shown.active}`);
    list.children[shown.active].scrollIntoView({ block: "nearest" });
  }

  // close hides the list.
  function close() {
    if (!shown) return;
    shown = null;
    list.hidden = true;
    list.replaceChildren();
    messageBox.removeAttribute("aria-activedescendant");
  }

  // pick replaces the @ and the letters typed after it with @handle, followed
  // by a space unless one is already there, and closes the list.
  function pick(handle) {
    const caret = messageBox.selectionStart;
    const spaced = /^\s/.test(messageBox.value.slice(caret));
    messageBox.setRangeText(`@${handle}${spaced ? "" : " "}`, shown.start, caret, "end");
    close();
  }

  messageBox.addEventListener("input", refresh);
  messageBox.addEventListener("click", refresh);
  messageBox.addEventListener("keyup", refresh);
  messageBox.addEventListener("blur", close);

  // While the list is open it takes the keys that move through it, choose
  // from it, and close it. They are read here, before the message box's own
  // key handling, so Enter does not send the message, Up does not raise the
  // chat, and Escape does not fold it.
  document.querySelector(".composer-card").addEventListener("keydown", (event) => {
    if (!shown || event.target !== messageBox || event.isComposing || event.shiftKey) return;
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) {
      shown.active = (shown.active + step + shown.handles.length) % shown.handles.length;
      draw();
    } else if (event.key === "Enter" || event.key === "Tab") {
      pick(shown.handles[shown.active]);
    } else if (event.key === "Escape") {
      dismissed = shown.start;
      close();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);

  // A click on a row chooses it. The press is cancelled so the message box
  // keeps the keyboard, including while dragging the list's scrollbar.
  list.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const option = event.target.closest(".mention-suggestion");
    if (option) pick(option.dataset.handle);
  });
})();
