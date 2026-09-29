export class PanelDivider extends HTMLElement {
    constructor(){
        super();this.attachShadow({mode:'open'}).innerHTML=`<style>:host{display:block;cursor:ew-resize;touch-action:none;background:var(--cat-surface);} :host(:hover),:host(:focus-visible){background:var(--cat-accent);} :host(:focus-visible){outline:none;}</style>`;
        this.value=350;
        this.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();this.focus();this.setPointerCapture(e.pointerId);this.drag={x:e.clientX,value:this.value};});
        this.addEventListener('pointermove',e=>{if(this.drag)this.resize(this.drag.value+this.drag.x-e.clientX);});
        for(const name of ['pointerup','pointercancel','lostpointercapture'])this.addEventListener(name,()=>{this.drag=null;});
        this.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();this.resize(this.value+(e.key==='ArrowLeft'?20:-20));});
    }
    connectedCallback(){this.tabIndex=0;this.setAttribute('role','separator');this.setAttribute('aria-orientation','vertical');this.resize(this.value,false);}
    resize(value,notify=true){this.value=Math.round(Math.max(260,Math.min(innerWidth*.6,Number(value)||350)));this.setAttribute('aria-valuemin','260');this.setAttribute('aria-valuemax',String(Math.round(innerWidth*.6)));this.setAttribute('aria-valuenow',String(this.value));if(notify)this.dispatchEvent(new CustomEvent('panel-resize',{bubbles:true,detail:{width:this.value}}));}
}
if(!customElements.get('cap-panel-divider'))customElements.define('cap-panel-divider',PanelDivider);
