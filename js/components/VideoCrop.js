export class VideoCrop extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode:'open'}).innerHTML = `<style>
            :host { display:block; position:relative; height:clamp(200px,38vh,480px); overflow:hidden; background:#000; touch-action:none; }
            :host(:focus-visible) { outline:2px solid var(--cat-accent); }
            ::slotted(video) { position:absolute; max-width:none; object-fit:fill; pointer-events:none; }
            .frame { position:absolute; box-sizing:border-box; border:2px solid var(--cat-accent); box-shadow:0 0 0 2000px #0009; pointer-events:none; }
            .resize { position:absolute; z-index:2; bottom:0; left:0; right:0; height:12px; cursor:ns-resize; background:var(--cat-surface); touch-action:none; }
            .resize::after { content:''; display:block; width:44px; height:3px; margin:4px auto; border-radius:3px; background:var(--cat-muted); }
            .resize:hover::after, .resize:focus-visible::after { background:var(--cat-accent); }
        </style><slot></slot><div class="frame"></div><div class="resize" role="separator" aria-orientation="horizontal" tabindex="0"></div>`;
        this.frame = this.shadowRoot.querySelector('.frame');
        this.resizeHandle=this.shadowRoot.querySelector('.resize');
        this.resizeHandle.addEventListener('pointerdown',e=> {
            if(e.button!==0)return;
            e.stopPropagation(); e.preventDefault(); this.resizeHandle.focus();
            this.resizeHandle.setPointerCapture(e.pointerId);
            this.resizing={y:e.clientY,height:this.clientHeight};
        });
        this.resizeHandle.addEventListener('pointermove',e=> {
            if(!this.resizing)return;
            e.stopPropagation(); this.setHeight(this.resizing.height+e.clientY-this.resizing.y,true);
        });
        for(const event of ['pointerup','pointercancel','lostpointercapture'])this.resizeHandle.addEventListener(event,()=>{this.resizing=null;});
        this.resizeHandle.addEventListener('keydown',e=> {
            if(!['ArrowUp','ArrowDown','Home'].includes(e.key))return;
            e.preventDefault();e.stopPropagation();
            this.setHeight(e.key==='Home'?200:this.clientHeight+(e.key==='ArrowUp'?-20:20),true);
        });
        this.state = {zoom:1,x:.5,y:.5};
        this.settings = {width:512,height:256,fit:'crop'};
        this.addEventListener('pointerdown', e => {
            if (e.button !== 0 || !this.editable) return;
            this.focus(); this.setPointerCapture(e.pointerId);
            this.drag = {...this.state};
            this.drag.px=e.clientX; this.drag.py=e.clientY;
        });
        this.addEventListener('pointermove', e => {
            if (!this.drag || !this.geometry) return;
            const {sw,sh,cw,ch,scale}=this.geometry;
            this.change({...this.state,
                x:sw>cw?this.drag.x-(e.clientX-this.drag.px)/scale/(sw-cw):.5,
                y:sh>ch?this.drag.y-(e.clientY-this.drag.py)/scale/(sh-ch):.5});
        });
        for (const event of ['pointerup','pointercancel','lostpointercapture']) this.addEventListener(event,()=>{this.drag=null;});
        this.addEventListener('keydown', e => {
            if (!this.editable || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation();
            const step=e.shiftKey ? .1 : .01;
            this.change({...this.state,x:this.state.x+(e.key==='ArrowLeft'?step:e.key==='ArrowRight'?-step:0),y:this.state.y+(e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0)});
        });
        this.loaded = () => this.render();
        this.observer = new ResizeObserver(()=>this.render());
    }
    connectedCallback() {
        this.tabIndex=0;
        this.resizeHandle.setAttribute('aria-label',this.getAttribute('resize-label') || 'Resize preview');
        this.video=this.querySelector('video');
        this.video?.addEventListener('loadedmetadata',this.loaded);
        this.observer.observe(this);
        this.render();
    }
    disconnectedCallback() { this.observer.disconnect(); this.video?.removeEventListener('loadedmetadata',this.loaded); }
    setHeight(value, notify=false) {
        const height=Math.round(Math.max(140,Math.min(innerHeight*.75,Number(value)||200)));
        this.style.height=`${height}px`;
        this.resizeHandle.setAttribute('aria-valuemin','140');
        this.resizeHandle.setAttribute('aria-valuemax',String(Math.round(innerHeight*.75)));
        this.resizeHandle.setAttribute('aria-valuenow',String(height));
        if(notify)this.dispatchEvent(new CustomEvent('preview-resize',{bubbles:true,detail:{height}}));
    }
    configure(settings, crop, editable) {
        this.settings=settings;
        this.state={zoom:1,x:.5,y:.5,...crop};
        this.editable=editable && settings.fit==='crop';
        this.style.cursor=this.editable?'grab':'default';
        this.render();
    }
    change(state) {
        this.state={zoom:Math.max(1,Math.min(4,state.zoom)),x:Math.max(0,Math.min(1,state.x)),y:Math.max(0,Math.min(1,state.y))};
        this.render();
        this.dispatchEvent(new CustomEvent('crop-change',{bubbles:true,detail:{...this.state}}));
    }
    render() {
        const video=this.video, sw=video?.videoWidth, sh=video?.videoHeight;
        if (!sw || !sh) return;
        const {width:w,height:h,fit}=this.settings;
        const viewHeight=this.clientHeight-12;
        const f=Math.min(this.clientWidth*.84/w,viewHeight*.84/h);
        const fw=w*f, fh=h*f, left=(this.clientWidth-fw)/2, top=(viewHeight-fh)/2;
        let cw=Math.max(2,Math.floor(Math.min(sw,sh*w/h)/this.state.zoom/2)*2);
        let ch=Math.max(2,Math.floor(Math.min(sh,sw*h/w)/this.state.zoom/2)*2);
        let scale=fw/cw, vw=sw*scale, vh=sh*fh/ch;
        let x=left-Math.floor((sw-cw)*this.state.x/2)*2*scale;
        let y=top-Math.floor((sh-ch)*this.state.y/2)*2*fh/ch;
        if (fit==='pad') {
            scale=Math.min(fw/sw,fh/sh); vw=sw*scale; vh=sh*scale;
            x=left+(fw-vw)/2; y=top+(fh-vh)/2;
        }
        this.geometry={sw,sh,cw,ch,scale};
        Object.assign(video.style,{width:`${vw}px`,height:`${vh}px`,left:`${x}px`,top:`${y}px`});
        Object.assign(this.frame.style,{width:`${fw}px`,height:`${fh}px`,left:`${left}px`,top:`${top}px`});
    }
}
if (!customElements.get('cap-video-crop')) customElements.define('cap-video-crop',VideoCrop);
