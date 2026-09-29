export class VideoCrop extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode:'open'}).innerHTML=`<style>
            :host {display:block;position:relative;width:100%;height:100%;min-height:140px;overflow:hidden;background:#000;touch-action:none;}
            ::slotted(video) {position:absolute;max-width:none;pointer-events:none;}
            .frame {position:absolute;box-sizing:border-box;border:2px solid var(--cat-accent);box-shadow:0 0 0 4000px #0009;cursor:move;touch-action:none;}
            .frame:focus-visible {outline:2px solid var(--cat-text);outline-offset:2px;}
            .frame[hidden] {display:none;}
            .handle {position:absolute;width:12px;height:12px;background:var(--cat-accent);border:1px solid var(--cat-surface);box-sizing:border-box;}
            [data-corner="nw"] {top:-6px;left:-6px;cursor:nwse-resize;}
            [data-corner="ne"] {top:-6px;right:-6px;cursor:nesw-resize;}
            [data-corner="sw"] {bottom:-6px;left:-6px;cursor:nesw-resize;}
            [data-corner="se"] {bottom:-6px;right:-6px;cursor:nwse-resize;}
            :host([readonly]) .handle {display:none;}
            :host([readonly]) .frame {cursor:default;}
        </style><slot></slot><div class="frame" tabindex="0" role="group">${['nw','ne','sw','se'].map(c=>`<span class="handle" data-corner="${c}"></span>`).join('')}</div>`;
        this.frame=this.shadowRoot.querySelector('.frame');
        this.state={zoom:1,x:.5,y:.5};this.settings={width:512,height:256,fit:'crop'};
        this.frame.addEventListener('pointerdown',e=>{
            if(e.button!==0 || !this.editable || !this.geometry)return;
            e.preventDefault();e.stopPropagation();this.frame.focus();this.frame.setPointerCapture(e.pointerId);
            this.drag={...this.geometry,px:e.clientX,py:e.clientY,corner:e.target.dataset.corner};
        });
        this.frame.addEventListener('pointermove',e=>{
            if(!this.drag)return;
            const d=this.drag, dx=(e.clientX-d.px)/d.scale,dy=(e.clientY-d.py)/d.scale;
            let {left,top,cw,ch}=d;
            if(d.corner){
                const sx=d.corner.includes('e')?1:-1,sy=d.corner.includes('s')?1:-1;
                const ax=left+(sx<0?cw:0),ay=top+(sy<0?ch:0);
                const maxWidth=Math.min(sx>0?d.sw-ax:ax,(sy>0?d.sh-ay:ay)*d.ratio,d.baseWidth);
                cw=Math.max(d.baseWidth/4,Math.min(maxWidth,cw+(sx*dx+sy*dy/d.ratio)/(1+1/d.ratio**2)));
                ch=cw/d.ratio;left=sx>0?ax:ax-cw;top=sy>0?ay:ay-ch;
            }else{left+=dx;top+=dy;}
            left=Math.max(0,Math.min(d.sw-cw,left));top=Math.max(0,Math.min(d.sh-ch,top));
            this.change({zoom:d.baseWidth/cw,x:d.sw>cw?left/(d.sw-cw):.5,y:d.sh>ch?top/(d.sh-ch):.5});
        });
        for(const name of ['pointerup','pointercancel','lostpointercapture'])this.frame.addEventListener(name,()=>{this.drag=null;});
        this.frame.addEventListener('keydown',e=>{
            if(!this.editable)return;
            if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;
            e.preventDefault();e.stopPropagation();const step=e.shiftKey?.1:.01;
            if(e.key==='Home')this.change({zoom:1,x:.5,y:.5});
            else this.change({...this.state,x:this.state.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:this.state.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0),zoom:this.state.zoom+(['+','='].includes(e.key)?.1:e.key==='-'?-.1:0)});
        });
        this.loaded=()=>this.render();this.observer=new ResizeObserver(()=>this.render());
    }
    connectedCallback(){this.video=this.querySelector('video');this.frame.setAttribute('aria-label',this.getAttribute('aria-label')||'Crop');this.video?.addEventListener('loadedmetadata',this.loaded);this.observer.observe(this);this.render();}
    disconnectedCallback(){this.observer.disconnect();this.video?.removeEventListener('loadedmetadata',this.loaded);}
    configure(settings,crop,editable){this.settings=settings;this.state={zoom:1,x:.5,y:.5,...crop};this.editable=editable && settings.fit==='crop';this.toggleAttribute('readonly',!this.editable);this.render();}
    change(state){this.state={zoom:Math.max(1,Math.min(4,state.zoom)),x:Math.max(0,Math.min(1,state.x)),y:Math.max(0,Math.min(1,state.y))};this.render();this.dispatchEvent(new CustomEvent('crop-change',{bubbles:true,detail:{...this.state}}));}
    render(){
        const video=this.video,sw=video?.videoWidth,sh=video?.videoHeight;if(!sw || !sh)return;
        const scale=Math.min((this.clientWidth-16)/sw,(this.clientHeight-16)/sh),vx=(this.clientWidth-sw*scale)/2,vy=(this.clientHeight-sh*scale)/2;
        Object.assign(video.style,{width:`${sw*scale}px`,height:`${sh*scale}px`,left:`${vx}px`,top:`${vy}px`});
        const ratio=this.settings.width/this.settings.height,baseWidth=Math.min(sw,sh*ratio),cw=baseWidth/this.state.zoom,ch=cw/ratio;
        const left=(sw-cw)*this.state.x,top=(sh-ch)*this.state.y;
        this.geometry={sw,sh,scale,ratio,baseWidth,cw,ch,left,top};
        this.frame.hidden=this.settings.fit!=='crop';
        Object.assign(this.frame.style,{width:`${cw*scale}px`,height:`${ch*scale}px`,left:`${vx+left*scale}px`,top:`${vy+top*scale}px`});
    }
}
if(!customElements.get('cap-video-crop'))customElements.define('cap-video-crop',VideoCrop);
