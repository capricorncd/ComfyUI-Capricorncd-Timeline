import './FormRow.js';
import { makeT } from '../cap_i18n.js';

const T = makeT({
    zh: { appearance: '外观', fontSize: '界面字体大小（像素）', mode: '明暗模式', system: '跟随系统', light: '明亮', dark: '暗黑', color: '主题色', jade: '玉青', blue: '海蓝', violet: '紫罗兰', amber: '琥珀' },
    en: { appearance: 'Appearance', fontSize: 'Interface font size (px)', mode: 'Color mode', system: 'System', light: 'Light', dark: 'Dark', color: 'Accent color', jade: 'Jade', blue: 'Ocean', violet: 'Violet', amber: 'Amber' },
    ja: { appearance: '外観', fontSize: 'UI文字サイズ（px）', mode: '表示モード', system: 'システム', light: 'ライト', dark: 'ダーク', color: 'テーマカラー', jade: '翡翠', blue: '海', violet: '紫', amber: '琥珀' },
});
const MODE_KEY = 'cap-timeline-color-mode';
const COLOR_KEY = 'cap-timeline-accent';
const FONT_SIZE_KEY = 'cap-timeline-font-size';
const MODES = ['system', 'light', 'dark'];
const COLORS = ['jade', 'blue', 'violet', 'amber'];

export class ThemePicker extends HTMLElement {
    connectedCallback() {
        this.target = this.closest('.cat-te-overlay, [data-theme-root]') || this.parentElement;
        this.media = window.matchMedia('(prefers-color-scheme: dark)');
        this.style.display = 'grid';
        this.style.gap = '16px';
        this.innerHTML = `<label><cap-form-row><span>${T('mode')}</span><cap-select><select name="mode">${MODES.map(value => `<option value="${value}">${T(value)}</option>`).join('')}</select></cap-select></cap-form-row></label>
            <label><cap-form-row><span>${T('color')}</span><cap-select><select name="color">${COLORS.map(value => `<option value="${value}">${T(value)}</option>`).join('')}</select></cap-select></cap-form-row></label>
            <label><cap-form-row><span>${T('fontSize')}</span><cap-input><input name="fontSize" type="number" min="10" max="24" step="1" /></cap-input></cap-form-row></label>`;
        this.onchange = event => {
            if (event.target.name === 'mode') localStorage.setItem(MODE_KEY, event.target.value);
            if (event.target.name === 'color') localStorage.setItem(COLOR_KEY, event.target.value);
            if (event.target.name === 'fontSize') {
                const size = Number(event.target.value);
                localStorage.setItem(FONT_SIZE_KEY, String(Number.isFinite(size) && size > 0 ? Math.min(24, Math.max(10, size)) : 16));
            }
            this.refresh();
        };
        this.refresh = () => {
            const mode = localStorage.getItem(MODE_KEY);
            const color = localStorage.getItem(COLOR_KEY);
            this.mode = MODES.includes(mode) ? mode : 'system';
            this.color = COLORS.includes(color) ? color : 'jade';
            const size = Number(localStorage.getItem(FONT_SIZE_KEY));
            this.fontSize = Number.isFinite(size) && size > 0 ? Math.min(24, Math.max(10, size)) : 16;
            const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
            this.target.style.setProperty('--cat-font-size', `${this.fontSize / rootSize}rem`);
            this.target.dataset.catTheme = this.mode === 'system' ? (this.media.matches ? 'dark' : 'light') : this.mode;
            this.target.dataset.catAccent = this.color;
            this.target.dispatchEvent(new CustomEvent('cap-theme-change', { bubbles: true }));
            this.querySelector('[name="mode"]').value = this.mode;
            this.querySelector('[name="color"]').value = this.color;
            this.querySelector('[name="fontSize"]').value = this.fontSize;
        };
        this.media.addEventListener('change', this.refresh);
        window.addEventListener('storage', this.refresh);
        this.refresh();
    }

    disconnectedCallback() {
        this.media?.removeEventListener('change', this.refresh);
        window.removeEventListener('storage', this.refresh);

    }
}

if (!customElements.get('cap-theme-picker')) customElements.define('cap-theme-picker', ThemePicker);
