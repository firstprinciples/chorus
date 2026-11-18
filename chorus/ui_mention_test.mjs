// Exercise the message box's mention suggestions: which participants are
// listed, how the keyboard chooses one, and when the list stays out of the way.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./ui/mention.js', import.meta.url), 'utf8');

// The fixture implements only the browser APIs the served script uses: a
// message box with a caret, the list element, and the two composer fields.
function harness({ agents, me = 'richard', target = '#build' }) {
  const listeners = (node) => {
    node.handlers = {};
    node.addEventListener = (event, callback) => { node.handlers[event] = callback; };
    return node;
  };
  const box = listeners({ value: '', selectionStart: 0, selectionEnd: 0, attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    } });
  const list = listeners({ hidden: true, children: [],
    replaceChildren(...rows) { this.children = rows; } });
  const card = listeners({});
  const elements = { 'send-text': box, 'mention-suggestions': list,
    'send-handle': { value: me }, 'send-target': { value: target } };
  const context = {
    document: { getElementById: (id) => elements[id], querySelector: () => card },
    window: { ChorusUI: {
      state: { view: { agents } },
      el: (tag, attrs) => ({ ...attrs, scrollIntoView() {} }),
      handleBadge: (handle) => `@${handle}`,
    } },
  };
  vm.runInNewContext(source, context);
  return {
    box,
    get listed() { return list.hidden ? null : list.children.map((row) => row.dataset.handle); },
    // type puts text in the message box with the caret at its end.
    type(text) {
      box.value = text;
      box.selectionStart = box.selectionEnd = text.length;
      box.handlers.input();
    },
    // key presses a key in the message box and reports whether the list
    // took it, which keeps it from the message box's own key handling.
    key(name) {
      let taken = false;
      card.handlers.keydown({ key: name, target: box,
        preventDefault() {}, stopPropagation() { taken = true; } });
      box.handlers.keyup();
      return taken;
    },
  };
}

const agents = [
  { handle: 'codex-c', model: 'GPT' }, { handle: 'claude-lead', model: 'Claude' },
  { handle: 'richard', model: 'human' }, { handle: 'alice', model: 'Claude' },
];

test('lists other participants whose handle contains the typed letters, prefix matches first, and @all only for a channel', () => {
  const channel = harness({ agents });
  channel.type('ask @');
  assert.deepEqual(channel.listed, ['alice', 'claude-lead', 'codex-c', 'all']);
  channel.type('ask @c');
  assert.deepEqual(channel.listed, ['claude-lead', 'codex-c', 'alice']);
  channel.type('ask @AL');
  assert.deepEqual(channel.listed, ['alice', 'all']);
  channel.type('mail me@c');
  assert.equal(channel.listed, null);

  const direct = harness({ agents, target: '@codex-c' });
  direct.type('@al');
  assert.deepEqual(direct.listed, ['alice']);
});

test('Down then Enter writes the highlighted handle instead of sending, and later keys reach the message box', () => {
  const h = harness({ agents });
  h.type('@c');
  assert.equal(h.key('ArrowDown'), true);
  assert.equal(h.box.attributes['aria-activedescendant'], 'mention-suggestion-1');
  assert.equal(h.key('Enter'), true);
  assert.equal(h.box.value, '@codex-c ');
  assert.equal(h.listed, null);
  assert.equal(h.key('Enter'), false);
});

test('Escape closes the list until the person starts another mention', () => {
  const h = harness({ agents });
  h.type('@c');
  assert.equal(h.key('Escape'), true);
  h.type('@co');
  assert.equal(h.listed, null);
  assert.equal(h.key('Escape'), false);
  h.type('@co and @al');
  assert.deepEqual(h.listed, ['alice', 'all']);
});
