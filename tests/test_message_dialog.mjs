import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class Element extends EventTarget {
    constructor(tag) { super(); this.tag = tag; this.children = []; this.style = {}; this.attributes = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { this.children.push(...children); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    remove() { this.removed = true; }
    click() { this.dispatchEvent(new Event('click')); }
}
const document = {createElement: tag => new Element(tag), body: new Element('body')};
const source = readFileSync(new URL('../js/cap_ui.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const {showCapConfirm, showCapAlert} = new Function('document', 'makeT', `${source}; return {showCapConfirm, showCapAlert};`)(document, dict => key => dict.zh[key]);
for (const action of ['confirm', 'cancel', 'close', 'alternate']) {
    const pending = showCapConfirm('<img onerror=bad()>\nMessage', {alternateLabel: 'Other'});
    const dialog = document.body.children.at(-1);
    assert.equal(dialog.tag, 'cap-dialog');
    assert.equal(dialog.open, true);
    assert.equal(dialog.height, 'fit-content');
    assert.equal(dialog.children[1].textContent, '<img onerror=bad()>\nMessage');
    const buttons = dialog.children[2].children;
    if (action === 'close') dialog.close();
    else buttons[{cancel: 0, alternate: 1, confirm: 2}[action]].click();
    assert.equal(await pending, action === 'confirm' ? true : action === 'alternate' ? 'alternate' : false);
    assert.equal(dialog.removed, true);
}
const notice = showCapAlert('Failure');
const dialog = document.body.children.at(-1);
assert.equal(dialog.children[0].textContent, '提示');
assert.equal(dialog.children[2].children.length, 1);
dialog.children[2].children[0].click();
await notice;
console.log('Message dialogs: modal component, compact sizing, plain text, confirmation, cancellation, alternate and notice passed.');
