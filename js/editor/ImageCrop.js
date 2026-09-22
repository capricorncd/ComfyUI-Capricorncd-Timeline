import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';
import '../components/Dialog.js';
import '../components/StatusMessage.js';

export function fitCrop(rect, ratio) {
    if (!ratio) return {...rect};
    let width = rect.width, height = width / ratio;
    if (height > rect.height) { height = rect.height; width = height * ratio; }
    return {x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height};
}

export class ImageCrop {
    constructor(app, host) {
        this.app = app;
        this.dialog = document.createElement('cap-dialog');
        this.dialog.className = 'cat-te-image-crop-dialog';
        host.append(this.dialog);
    }

    async open(item) {
        const app = this.app;
        const row = app._ensureMedia('image', item.file);
        const resources = app._projectResources;
        const original = row.image_crop ? app._findMediaById(row.image_crop.source_id) : row;
        const dialog = this.dialog;
        dialog.innerHTML = `<span slot="title">${T('image_crop_title')}</span>
          <div class="cat-te-image-crop-body">
            <label>${T('image_crop_ratio')}<select data-ratio>${['original','16:9','4:3','9:16','3:4','1:1','free'].map(mode => `<option value="${mode}">${mode === 'original' ? T('image_crop_original') : mode === 'free' ? T('image_crop_free') : mode}</option>`).join('')}</select></label>
            <p>${T('image_crop_hint')}</p><canvas></canvas><span data-size></span>
          </div><div slot="footer"><cap-status-message></cap-status-message><div class="cat-te-confirm-actions">
            <cap-button data-reset>${T('image_crop_reset')}</cap-button><cap-button data-close>${T('cancel_btn')}</cap-button>
            <cap-button data-apply variant="primary" disabled>${T('apply_btn')}</cap-button></div></div>`;
        const status = dialog.querySelector('cap-status-message');
        const apply = dialog.querySelector('[data-apply]');
        const ratio = dialog.querySelector('[data-ratio]');
        const canvas = dialog.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        dialog.querySelector('[data-close]').onclick = () => dialog.close();
        dialog.showModal();
        if (!original) { status.setStatus(T('asset_missing_cannot_preview'), 'error'); return; }
        const image = new Image();
        image.src = app._imgUrl(original.file);
        try { await image.decode(); }
        catch { status.setStatus(T('asset_missing_cannot_preview'), 'error'); return; }
        if (!dialog.open || app._projectResources !== resources) return;
        const scale = Math.min(1, 960 / image.naturalWidth, 600 / image.naturalHeight);
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        let rect = {...(row.image_crop?.rect || {x:0, y:0, width:1, height:1})};
        ratio.value = row.image_crop?.ratio || 'original';
        const selectedRatio = () => ratio.value === 'free' ? null : ratio.value === 'original' ? 1
            : ratio.value.split(':').map(Number).reduce((a,b) => a/b) / (image.naturalWidth / image.naturalHeight);
        const draw = () => {
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(image,0,0,canvas.width,canvas.height);
            const x=rect.x*canvas.width, y=rect.y*canvas.height, w=rect.width*canvas.width, h=rect.height*canvas.height;
            ctx.fillStyle='#0009';
            ctx.fillRect(0,0,canvas.width,y); ctx.fillRect(0,y+h,canvas.width,canvas.height-y-h);
            ctx.fillRect(0,y,x,h); ctx.fillRect(x+w,y,canvas.width-x-w,h);
            ctx.strokeStyle='#67e8d4'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);
            ctx.fillStyle='#fff';
            for (const [cx,cy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) ctx.fillRect(cx-5,cy-5,10,10);
            dialog.querySelector('[data-size]').textContent = `${Math.round(rect.width*image.naturalWidth)} × ${Math.round(rect.height*image.naturalHeight)}`;
        };
        ratio.onchange = () => { rect=fitCrop(rect,selectedRatio()); draw(); };
        dialog.querySelector('[data-reset]').onclick = () => { rect=fitCrop({x:0,y:0,width:1,height:1},selectedRatio()); draw(); };
        let drag = null;
        const point = e => { const b=canvas.getBoundingClientRect(); return {x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))}; };
        canvas.onpointerdown = e => {
            if (dialog.closeDisabled) return;
            const p=point(e), b=canvas.getBoundingClientRect();
            const corners=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]];
            const corner=corners.findIndex(([x,y]) => Math.abs(p.x-x)*b.width<16 && Math.abs(p.y-y)*b.height<16);
            if (corner<0 && (p.x<rect.x || p.x>rect.x+rect.width || p.y<rect.y || p.y>rect.y+rect.height)) return;
            drag={p,rect:{...rect},corner}; canvas.setPointerCapture(e.pointerId); e.preventDefault();
        };
        canvas.onpointermove = e => {
            if (!drag) return;
            const p=point(e), r=drag.rect;
            if (drag.corner<0) rect={...r,x:Math.max(0,Math.min(1-r.width,r.x+p.x-drag.p.x)),y:Math.max(0,Math.min(1-r.height,r.y+p.y-drag.p.y))};
            else {
                const left=drag.corner%2===0, top=drag.corner<2;
                const ax=left?r.x+r.width:r.x, ay=top?r.y+r.height:r.y;
                let w=Math.max(1/image.naturalWidth,Math.min(left?ax:1-ax,left?ax-p.x:p.x-ax));
                let h=Math.max(1/image.naturalHeight,Math.min(top?ay:1-ay,top?ay-p.y:p.y-ay));
                const aspect=selectedRatio();
                if (aspect) { h=w/aspect; const maxH=top?ay:1-ay; if(h>maxH){h=maxH;w=h*aspect;} }
                rect={x:left?ax-w:ax,y:top?ay-h:ay,width:w,height:h};
            }
            draw();
        };
        canvas.onpointerup = canvas.onpointercancel = () => { drag=null; };
        draw(); apply.disabled=false;
        apply.onclick = async () => {
            const valid = () => app._projectResources===resources && app._findMediaById(row.id)===row;
            if (!valid()) return;
            apply.disabled=dialog.closeDisabled=true;
            ratio.disabled=dialog.querySelector('[data-reset]').disabled=dialog.querySelector('[data-close]').disabled=true;
            status.setStatus(T('loading_ellipsis'),'info');
            try {
                const location=app._mediaStatus.get(`image:${original.file}`)?.location || original.location || 'input';
                const response=await api.fetchApi('/audio_keyframe_timeline/crop_image',{method:'POST',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({file:original.file,location,dir:app.assetsDirInput?.value || '',rect})});
                const result=await response.json();
                if(!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
                if(!valid()) {dialog.close();return;}
                app._recordUndo();
                const oldFile=row.file, name=row.name, originalData={...original};
                delete originalData.id;
                app._replaceMediaReference(oldFile,result.file,'image',false,row);
                const source=original===row ? app._ensureMedia('image',originalData.file,originalData) : original;
                row.name=name;
                row.image_crop={source_id:source.id,rect:{...rect},ratio:ratio.value};
                app._saveToWidgets(); app._renderMediaGrid(); app._scheduleProgramPreview();
                dialog.close();
            } catch(error) {status.setStatus(error.message,'error');}
            finally {
                apply.disabled=dialog.closeDisabled=false;
                ratio.disabled=dialog.querySelector('[data-reset]').disabled=dialog.querySelector('[data-close]').disabled=false;
            }
        };
    }
}
