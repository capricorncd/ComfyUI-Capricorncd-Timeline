import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

class Element extends EventTarget {
    constructor() { super(); this.attrs = new Map(); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    setAttribute(key, value) { this.attrs.set(key, value); }
    attachShadow() {
        this.button = new Element();
        this.slot = new Element();
        return {querySelector: name => name === 'slot' ? this.slot : this.button};
    }
    querySelector() { return this.input; }
}
class Observer {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
}
let Slider;
vm.runInNewContext(readFileSync(new URL('../js/components/Slider.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export class Slider', 'class Slider'), {
    HTMLElement: Element, MutationObserver: Observer, Event,
    customElements: {get: () => false, define: (_, cls) => Slider = cls},
});
const slider = new Slider();
slider.input = new Element();
Object.assign(slider.input, {value: '500', defaultValue: '100', disabled: false});
slider.setAttribute('reset-label', 'Reset volume');
slider.connectedCallback();
assert.equal(slider.button.getAttribute('aria-label'), 'Reset volume');
const events = [];
for (const name of ['input', 'change']) slider.input.addEventListener(name, () => events.push([name, slider.input.value]));
const click = () => slider.button.dispatchEvent(new Event('click', {cancelable: true}));
click();
assert.equal(slider.input.value, '100');
assert.deepEqual(events, [['input', '100'], ['change', '100']]);
click();
assert.equal(events.length, 2, 'unchanged reset does not add undo/save events');
slider.input.value = '350';
slider.input.disabled = true;
slider._observer.callback();
assert.equal(slider.button.disabled, true);
click();
assert.equal(slider.input.value, '350');
slider.input.disabled = false;
slider._observer.callback();
slider.setAttribute('default-value', '75');
click();
assert.equal(slider.input.value, '75');
assert.equal(slider.button.disabled, false);
slider.disconnectedCallback();
console.log('Slider reset: default, explicit target, disabled state and input/change events passed.');
