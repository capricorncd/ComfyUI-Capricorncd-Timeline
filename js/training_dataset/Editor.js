import '../components/Button.js';
import '../components/FormControls.js';
import '../components/StatusMessage.js';
import '../components/ThemePicker.js';
import '../components/Disclosure.js';
import '../components/VideoCrop.js';
import '../components/PanelDivider.js';
import '../components/ContextMenu.js';
import '../components/DropdownButton.js';
import { bindDragSession } from '../timeline/utils.js';
import { Timeline } from '../timeline/index.js';
import { loadExtensionCss } from '../cap_ui.js';
import { FPS, windowBounds, scenesFromPoints, normalizeSelection, selectedClips, copyDatasetData } from './model.js';
import { T } from './i18n.js';
import { iconHtml } from '../cap_icons.js';
import { readDatasetResponse } from './api.js';
import { exportProject, importProject } from './project.js';

async function videoFingerprint(file) {
    const chunks = [];
    for (let offset = 0; offset < file.size; offset += 8 * 1024 * 1024) {
        chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer())));
    }
    const bytes = new Uint8Array(chunks.length * 32);
    chunks.forEach((chunk, i) => bytes.set(chunk, i * 32));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

const SIZE_PRESETS = [[512,256,'2:1'],[512,288,'16:9'],[512,512,'1:1'],[288,512,'9:16'],[256,512,'1:2'],[768,384,'2:1'],[384,768,'1:2']];
const PREFIX = '/cap/training_dataset';
export class TrainingDatasetEditor extends HTMLElement {
    async open(saved = {}, onSave = () => {}, apiURL = x => x) {
        saved = copyDatasetData(saved);
        this.apiURL = apiURL;
        this.onSave = onSave;
        this.sidebarWidth=saved.sidebarWidth || 350;
        this.settings = { width:512, height:256, frames:124, fit:'crop',cropAll:false, ...saved.settings };
        this.sources = [];
        this.source=null; this.current=null; this.relinkIndex=null;
        this.restoring=true;
        this.trackSelection=new Set();
        this.history = [];
        this.abort = new AbortController();
        loadExtensionCss('cap_timeline_editor.css');
        loadExtensionCss('timeline/timeline.css');
        loadExtensionCss('training_dataset/editor.css');
        this.className = 'cat-te-overlay open cap-training-editor';
        this.setAttribute('role','region');
        this.setAttribute('aria-label',T('title'));
        this.innerHTML = `<header><h1>${T('title')}</h1><cap-button data-action="add">${T('add')}</cap-button><cap-select><select data-source aria-label="${T('add')}"></select></cap-select><cap-button data-action="relink">${T('relink')}</cap-button><cap-button data-action="import-json">${T('importJson')}</cap-button><cap-button data-action="export-json">${T('exportJson')}</cap-button><input data-json-file type="file" accept=".json,application/json" hidden><div class="ct-header-actions"><cap-button data-action="cancel" disabled hidden>${T('cancel')}</cap-button><cap-button data-action="export" variant="primary">${T('export')}</cap-button><cap-button data-action="close">${T('close')}</cap-button></div></header>
          <div class="ct-import"><cap-input><input data-path placeholder="${T('path')}" aria-label="${T('path')}"></cap-input><cap-button data-action="load">${T('load')}</cap-button><input data-file type="file" accept="video/*,.mkv" multiple hidden></div>
          <main><section class="ct-preview"><cap-video-crop aria-label="${T('cropHint')}"><video muted playsinline preload="metadata"></video></cap-video-crop></section><cap-panel-divider aria-label="${T('resizeColumns')}"></cap-panel-divider>
          <aside><h2 data-title>${T('empty')}</h2><label><cap-switch><input data-selected type="checkbox"></cap-switch> ${T('enableExport')}</label><p data-range class="ct-hint"></p><label>${T('start')}<cap-input><input data-offset type="number" min="0" step="0.0416666667"></cap-input></label><input data-slider type="range" step="1" aria-label="${T('start')}"><cap-button data-action="remove" variant="danger">${T('remove')}</cap-button>
          <label>${T('caption')}<cap-textarea><textarea data-caption rows="6"></textarea></cap-textarea></label><label>${T('agent')}<cap-select><select data-agent></select></cap-select></label><p class="ct-hint">${T('agentHint')}</p><cap-button data-action="auto">${T('auto')}</cap-button><cap-button data-action="batch">${T('batch')}</cap-button>
          <h2>${T('settings')}</h2><label>${T('resolution')}<cap-select data-resolution-control><select data-resolution required></select></cap-select></label><p class="ct-hint">${T('resolutionHint')}</p><label>${T('frames')}<cap-input><input data-setting="frames" type="number" min="124" max="345" step="17"></cap-input></label><label>${T('fit')}<cap-select><select data-setting="fit"><option value="crop">${T('crop')}</option><option value="pad">${T('pad')}</option></select></cap-select></label><p data-summary class="ct-hint"></p><cap-status-message closable close-label="${T('close')}"></cap-status-message><cap-disclosure><span slot="title">${T('appearance')}</span><cap-theme-picker></cap-theme-picker></cap-disclosure></aside></main>
          <div data-timeline class="ct-timeline"></div>`;
        document.body.append(this);
        const divider=this.querySelector('cap-panel-divider');divider.resize(this.sidebarWidth,false);
        this.sidebarWidth=divider.value;this.style.setProperty('--ct-sidebar-width',`${this.sidebarWidth}px`);
        divider.addEventListener('panel-resize',e=>{this.sidebarWidth=e.detail.width;this.style.setProperty('--ct-sidebar-width',`${this.sidebarWidth}px`);this.scheduleSave();});
        this.querySelector('[data-json-file]').onchange=async e=> {
            const file=e.target.files[0];if(!file)return;
            try {
                if(file.size>20*1024*1024)throw new Error(T('invalidProject'));
                const imported=importProject(await file.text());
                const onSave=this.onSave, apiURL=this.apiURL;
                this.remove();
                await this.open(imported,onSave,apiURL);
            } catch(error) {this.status.setStatus(`${T('invalidProject')}: ${error.message}`,'error');}
            finally {e.target.value='';}
        };
        this.video = this.querySelector('video');
        this.video.addEventListener('loadedmetadata',()=>{
            if(this.pendingVideoTime!=null){this.video.currentTime=Math.min(this.video.duration,this.pendingVideoTime);this.pendingVideoTime=null;}
        },{signal:this.abort.signal});
        for(const name of ['pause','seeked'])this.video.addEventListener(name,()=>{if(!this.restoring && !this.hoverSegment)this.scheduleSave();},{signal:this.abort.signal});
        this.cropPreview = this.querySelector('cap-video-crop');
        this.cropPreview.addEventListener('crop-change', e => {
            if (this.busy) return;
            if(this.settings.cropAll)this.settings.sharedCrop=e.detail;
            else if(this.current)this.current.crop=e.detail;
            this.scheduleSave();
        });
        this.status = this.querySelector('cap-status-message');
        for (const input of this.querySelectorAll('[data-setting]')) input.value = this.settings[input.dataset.setting];
        const resolution=this.querySelector('[data-resolution]');
        const sizes=SIZE_PRESETS.map(([w,h,ratio])=>({value:`${w}x${h}`,label:`${w} × ${h} · ${ratio}${w===512 && h===256?' · '+T('defaultSize'):''}`}));
        const savedSize=`${this.settings.width}x${this.settings.height}`;
        if (!sizes.some(item=>item.value===savedSize)) sizes.push({value:savedSize,label:`${this.settings.width} × ${this.settings.height} · ${T('savedSize')}`});
        this.querySelector('[data-resolution-control]').setOptions(sizes,T('resolution'));
        resolution.value=savedSize;
        resolution.onchange=()=> {
            [this.settings.width,this.settings.height]=resolution.value.split('x').map(Number);
            this.inspect(); this.save();
        };
        this.addEventListener('click', e => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action) this.action(action).catch(error => this.status.setStatus(error.message,'error'));
        }, {signal:this.abort.signal});
        this.querySelector('[data-agent]').onchange=e=>{this.settings.agent=e.target.value;this.save();};
        this.querySelector('[data-source]').onchange = e => this.switchSource(Number(e.target.value));
        this.querySelector('[data-file]').onchange = e => this.perform(async () => {
            for (const file of Array.from(e.target.files).slice(0,this.relinkIndex == null ? undefined : 1)) {
                const fingerprint = crypto.subtle ? await videoFingerprint(file) : null;
                const found = fingerprint ? await this.request('/lookup', {size:file.size, fingerprint}) : null;
                if (found?.source) this.addSource(found.source);
                else {
                    const data = new FormData(); data.append('file',file);
                    this.addSource(await this.request('/upload',data));
                }
            }
            e.target.value = '';
        }).catch(error => this.status.setStatus(error.message,'error')).finally(()=>{this.relinkIndex=null;e.target.value='';});
        this.querySelector('[data-file]').addEventListener('cancel',()=>{this.relinkIndex=null;});
        this.querySelector('[data-selected]').onchange = e => {
            if (this.current) { this.remember(); this.current.selected=e.target.checked; this.save(); this.updateTrackState(); }
        };
        this.querySelector('[data-caption]').oninput = e => {
            if (this.current) { this.current.caption=e.target.value; this.current.caption_origin='manual'; this.scheduleSave(); }
        };
        this.querySelector('[data-offset]').onchange = e => this.setOffset(Number(e.target.value)*FPS);
        this.querySelector('[data-slider]').oninput = e => this.setOffset(Number(e.target.value));
        for (const input of this.querySelectorAll('[data-setting]')) input.onchange = () => {
            if (!input.checkValidity()) { input.reportValidity(); return; }
            this.settings[input.dataset.setting] = input.type === 'number' ? Number(input.value) : input.value;
            normalizeSelection(this.sources,this.settings.frames); this.updateTrackState(); this.inspect(); this.save();
        };
        this.video.addEventListener('error',() => this.status.setStatus(this.video.error?.message || T('error'),'error'),{signal:this.abort.signal});
        this.video.addEventListener('ended',()=>{if(this.hoverSegment)this.startHover(this.hoverSegment);},{signal:this.abort.signal});
        this.keyHandler = e => {
            if (e.composedPath().some(el => el.matches?.('input:not([type=checkbox]),textarea,select,cap-context-menu,[contenteditable="true"]'))) return;
            const command=(e.ctrlKey || e.metaKey) && e.code==='KeyG'?'merge':
                !e.ctrlKey && !e.metaKey && !e.altKey && e.code==='KeyQ'?'trim-left':
                !e.ctrlKey && !e.metaKey && !e.altKey && e.code==='KeyW'?'trim-right':
                (e.ctrlKey || e.metaKey) && e.code==='KeyB'?'toggle':
                (e.ctrlKey || e.metaKey) && !e.shiftKey && e.code==='KeyZ'?'undo':
                ['Delete','Backspace'].includes(e.code)?'remove':null;
            if(command) {e.preventDefault();e.stopImmediatePropagation();this.action(command).catch(error=>this.status.setStatus(error.message,'error'));return;}
            if (e.code==='Space' && e.composedPath().some(el=>el.matches?.('cap-button,video'))) return;
            if (e.code === 'KeyM' || e.code === 'Space' || e.code === 'Escape') {
                e.preventDefault(); e.stopImmediatePropagation();
                this.action(e.code==='KeyM'?'mark':e.code==='Space'?'play':'close').catch(error => this.status.setStatus(error.message,'error'));
            }
        };
        window.addEventListener('keydown',this.keyHandler,true);
        this.tick = () => {
            if (!this.isConnected) return;
            if(this.pendingVideoTime!=null){this.raf=requestAnimationFrame(this.tick);return;}
            if (this.hoverSegment && !this.video.paused && !this.video.seeking) {
                if(this.video.currentTime>=this.hoverSegment.end-.015 || this.video.currentTime<this.hoverSegment.start-.05)this.video.currentTime=this.hoverSegment.start;
            }
            if(!this.hoverSegment && !this.video.paused && this.source?.segments.some(s=>s.timelineStart!=null)) {
                const time=this.video.currentTime, rows=this.source.segments;
                if(!rows.some(s=>time>=s.start && time<s.end) && rows.some(s=>s.end<=time)) {
                    const next=rows.find(s=>s.start>time);
                    if(next)this.video.currentTime=next.start;else this.video.pause();
                }
            }
            const time=this.video.currentTime || 0;
            if(this.timeline && time!==this.lastVideoTime){
                this.lastVideoTime=time;
                this.timeline.setCurrentTime(this.toTrackTime(time),{userSeek:false});
            }
            this.raf=requestAnimationFrame(this.tick);
        };
        this.raf=requestAnimationFrame(this.tick);
        await this.perform(async () => {
            this.restoring=true;
            for (const src of saved.sources || []) {
                try { const restored = await this.request('/source',{path:src.path}); this.addSource({...src,...restored,name:src.name || restored.name,keepMissing:false}); }
                catch (error) {
                    if (!src.keepMissing && !Array.isArray(src.segments) && /\[(?:WinError [23]|Errno 2)\]/.test(error.message)) continue;
                    this.sources.push({...src,token:null});
                    this.querySelector('[data-source]').add(new Option(`${src.name} (${T('error')})`,String(this.sources.length-1)));
                    this.status.setStatus(`${src.name}: ${error.message}`,'warning');
                }
            }
            const activeIndex=this.sources.findIndex(s=>s.path===saved.activeSourcePath);
            if(this.sources.length)this.switchSource(activeIndex>=0?activeIndex:0);
            this.restoring=false;
            try {
                const response=await fetch(this.apiURL('/audio_keyframe_timeline/vl_models'));
                if (!response.ok) throw new Error(T('missingAgent'));
                const data=await response.json();
                const select=this.querySelector('[data-agent]');
                select.replaceChildren(new Option(T('agent'),''));
                for (const model of data.models || []) select.add(new Option(model,`model:${model}`));
                for (const agent of data.agents || []) select.add(new Option(agent.label || agent.model,`agent:${agent.id}`));
                if(this.settings.agent && [...select.options].some(o=>o.value===this.settings.agent))select.value=this.settings.agent;
                if (select.options.length===1) this.status.setStatus(T('missingAgent'),'warning');
            } catch (error) { this.status.setStatus(error.message,'warning'); }
        });
        this.updateTrackState();
        this.save();
    }
    async request(path, body) {
        const response=await fetch(this.apiURL(PREFIX+path),body === undefined ? {} : body instanceof FormData ? {method:'POST',body} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return readDatasetResponse(response, PREFIX+path, {restart:T('restartBackend'),invalid:T('invalidResponse')});
    }
    scheduleSave() {
        this.captureView();
        clearTimeout(this.saveTimer);
        this.saveTimer=setTimeout(()=>this.save(),150);
    }
    captureView() {
        if(!this.isConnected || this.restoring || !this.source || !this.timeline)return;
        this.source.editorView={zoom:this.timeline.getZoom(),scroll:this.timeline.scrollEl.scrollLeft,scrollTop:this.timeline.scrollEl.scrollTop,
            time:this.pendingVideoTime??this.video.currentTime??0,currentId:this.current?.id,selectedIds:[...this.trackSelection]};
    }
    save() {
        this.captureView();
        clearTimeout(this.saveTimer);this.saveTimer=null;
        if (!this.restoring) this.onSave({version:1,activeSourcePath:this.source?.path,sidebarWidth:this.sidebarWidth,settings:this.settings,sources:this.sources.map(({token,...source})=>source)});
        const selected=selectedClips(this.sources,this.settings.frames);
        this.querySelector('[data-summary]').textContent=`${T('selected')}: ${selected.length} · ${T('blank')}: ${selected.filter(s=>!s.caption.trim()).length} · ${this.settings.frames}f / ${(this.settings.frames/FPS).toFixed(3)}s`;
    }
    async perform(callback) {
        if (this.busy) return;
        this.busy=true;
        this.querySelector('[data-action="cancel"]').hidden=false;
        this.querySelector('aside').inert=true;
        this.querySelector('.ct-import').inert=true;
        for (const b of this.querySelectorAll('[data-action]')) b.disabled=!['cancel','play','prev','next'].includes(b.dataset.action);
        this.querySelector('[data-source]').disabled=true;
        if(this.querySelector('[data-crop-all]'))this.querySelector('[data-crop-all]').disabled=true;
        this.updateTrackState();
        try { return await callback(); }
        finally {
            this.querySelector('[data-action="cancel"]').hidden=true;
            this.busy=false; this.querySelector('aside').inert=false; this.querySelector('.ct-import').inert=false;
            for (const b of this.querySelectorAll('[data-action]')) b.disabled=b.dataset.action==='cancel';
            this.querySelector('[data-source]').disabled=false;
            if(this.querySelector('[data-crop-all]'))this.querySelector('[data-crop-all]').disabled=false;
            this.inspect();this.updateTrackState();
        }
    }
    async job(path,payload) {
        this.jobId=(await this.request(path,payload)).job;
        if(this.detecting && this.cancelBatch)await this.request(`/jobs/${this.jobId}/cancel`,{});
        try {
            while (this.isConnected) {
                const result=await this.request(`/jobs/${this.jobId}`);
                this.status.setStatus(`${T('busy')} ${result.done}/${result.total}`);
                if (result.state==='complete') return result.result;
                if (result.state==='failed') throw new Error(`${result.error}${result.directory ? '\n'+result.directory : ''}`);
                if (result.state==='cancelled') throw new Error(T(this.detecting?'detectCancelled':'cancelled'));
                await new Promise(resolve=>setTimeout(resolve,800));
            }
        } finally { this.jobId=null; }
    }
    addSource(source) {
        if(this.relinkIndex != null) {
            const old=this.sources[this.relinkIndex];
            if(old.width!==source.width || old.height!==source.height || Math.abs(old.duration-source.duration)>1/FPS)throw new Error(T('relinkMismatch'));
            const index=this.relinkIndex;
            this.sources[index]={...old,...source,keepMissing:false,segments:old.segments};
            this.querySelector('[data-source]').options[index].textContent=source.name;
            this.relinkIndex=null;this.switchSource(index);return;
        }
        const existing = this.sources.findIndex(item => item.path === source.path);
        if (existing >= 0) {
            this.sources[existing].token = source.token;
            this.querySelector('[data-source]').options[existing].textContent=this.sources[existing].name;
            this.switchSource(existing);
            return;
        }
        source.segments ||= scenesFromPoints([],source.duration);
        this.sources.push(source);
        this.querySelector('[data-source]').add(new Option(source.name,String(this.sources.length-1)));
        this.switchSource(this.sources.length-1);
    }
    switchSource(index) {
        this.captureView();
        this.hoverSegment=null;this.video.pause(); this.current=null;
        this.source=this.sources[index];
        this.querySelector('[data-source]').value=String(index);
        if(this.source.token){this.video.src=this.apiURL(`${PREFIX}/media/${this.source.token}`);this.status.setStatus('');}
        else {this.video.removeAttribute('src');this.video.load();this.status.setStatus(`${this.source.name}: ${T('missingSource')}`,'warning');}
        this.history=[]; this.trackSelection.clear();
        const view=this.source.editorView;
        this.pendingVideoTime=Number.isFinite(view?.time)?Math.max(0,Math.min(this.source.duration,view.time)):0;
        this.current=this.source.segments.find(s=>s.id===view?.currentId)||null;
        const ids=new Set(view?.selectedIds || []);this.trackSelection=new Set(this.source.segments.filter(s=>ids.has(s.id)).map(s=>s.id));
        this.renderTimeline(view || null);this.timeline.setCurrentTime(this.toTrackTime(this.pendingVideoTime),{userSeek:false});
        if(this.video.readyState>=1){this.video.currentTime=this.pendingVideoTime;this.pendingVideoTime=null;}
        this.updateTrackState(); this.inspect(); this.save();
    }
    renderTimeline(view = this.timeline?{zoom:this.timeline.getZoom(),scroll:this.timeline.scrollEl.scrollLeft,scrollTop:this.timeline.scrollEl.scrollTop}:null) {
        this.stopHover();this.previewObserver?.disconnect();this.trackMenu?.remove();clearTimeout(this.menuTimer);
        this.lastVideoTime=undefined;
        this.viewportObserver?.disconnect();cancelAnimationFrame(this.viewportFrame);this.viewportFrame=null;this.endTrim?.();
        this.timeline?.destroy();
        const host=this.querySelector('[data-timeline]'); host.replaceChildren();
        if (!this.source) return;
        const duration=this.source.segments.some(s=>s.timelineStart!=null)?Math.max(1,...this.source.segments.map(s=>(s.timelineStart??s.start)+s.end-s.start)):this.source.duration;
        this.timeline=new Timeline(host,{duration,fps:FPS,timeFormat:'ms',minZoom:.001,zoom:Math.max(.001,Math.min(1,host.clientWidth/(this.source.duration*80))),addTrackTypes:[]});
        const detect=document.createElement('cap-button');detect.dataset.action=this.detecting?'cancel':'detect';
        detect.textContent=T(this.detecting?'cancelDetect':'detect');detect.className='ct-detect';
        detect.disabled=this.busy && !this.detecting;this.timeline.toolbarEl.append(detect);
        const cropAll=document.createElement('label');cropAll.className='ct-crop-all';
        cropAll.innerHTML=`<cap-switch><input type="checkbox" data-crop-all></cap-switch> ${T('cropAll')}`;
        const input=cropAll.querySelector('input');input.checked=!!this.settings.cropAll;input.disabled=this.busy;
        input.addEventListener('change',()=>{
            if(input.checked)this.settings.sharedCrop={zoom:1,x:.5,y:.5,...this.effectiveCrop(this.current || this.source.segments[0])};
            this.settings.cropAll=input.checked;this.inspect();this.save();
        });
        this.timeline.toolbarEl.append(cropAll);
        const track=this.timeline.addTrack({type:'video',name:this.source.name});
        this.timelineClips=[];this.clipBySegment=new Map();this.mountedClips=new Set();this.trainingTrack=track;
        const previewSegments=new WeakMap();
        this.previewObserver=new IntersectionObserver(entries=>{
            for(const entry of entries){
                const segment=previewSegments.get(entry.target);
                if(entry.isIntersecting){
                    if(!entry.target.querySelector('.ct-preview-icon'))this.addPreviewButton(entry.target,segment);
                } else {
                    const button=entry.target.querySelector('.ct-preview-icon');
                    if(button && !button.matches(':focus-within')){
                        if(this.hoverSegment===segment)this.stopHover();
                        button.remove();
                    }
                }
            }
        },{root:this.timeline.scrollEl,rootMargin:'200px'});
        const trackParent=track.el.parentNode;track.el.remove();
        this.source.segments.forEach((segment,index)=> {
            const clip=this.timeline.addClip(track.id,{name:String(index+1),startTime:segment.timelineStart??segment.start,duration:segment.end-segment.start});
            clip.el.addEventListener('click',e=>this.choose(segment,e.ctrlKey || e.metaKey || e.shiftKey));
            for(const side of ['left','right'])clip.el.querySelector(`.tl-clip-handle-${side==='left'?'l':'r'}`).addEventListener('mousedown',e=>this.beginTrim(e,segment,side));
            previewSegments.set(clip.el,segment);this.previewObserver.observe(clip.el);this.mountedClips.add(clip);
            this.clipBySegment.set(segment.id,clip);
            this.timelineClips.push([segment,clip]);
        });
        this.syncViewport();
        trackParent.append(track.el);
        track.setLocked(true);
        this.bindTrackMenu(track);
        if(view){if(Number.isFinite(view.zoom))this.timeline.setZoom(view.zoom);this.timeline.scrollEl.scrollLeft=view.scroll||0;this.timeline.scrollEl.scrollTop=view.scrollTop||0;}
        this.timeline.on('zoomchange',()=>{this.syncViewport();this.scheduleSave();});
        const viewportChanged=()=>{if(!this.viewportFrame)this.viewportFrame=requestAnimationFrame(()=>{this.viewportFrame=null;this.syncViewport();});};
        this.timeline.scrollEl.addEventListener('scroll',()=>{viewportChanged();if(!this.restoring)this.scheduleSave();},{passive:true});
        this.viewportObserver=new ResizeObserver(viewportChanged);this.viewportObserver.observe(this.timeline.scrollEl);
        this.syncViewport();
        this.timeline.on('seek',({time})=> { this.hoverSegment=null;this.pendingVideoTime=null; this.video.currentTime=this.toSourceTime(time);this.scheduleSave(); });
        this.timeline.on('play',()=> { this.timeline.pause(); this.togglePlay(); });
        this.timeline.on('key',e=> { if (e.code==='Space') {e.preventDefault();this.togglePlay();} });
    }
    applyTrim(segment,start,end) {
        const delta=start-segment.start;
        segment.start=start;segment.end=end;
        if(segment.timelineStart!=null)segment.timelineStart+=delta;
        const bounds=windowBounds(segment,this.settings.frames);
        segment.offset=Math.max(bounds.min,Math.min(Math.max(bounds.min,bounds.max),Math.round(segment.offset*FPS)))/FPS;

        const clip=this.clipBySegment.get(segment.id);
        this.timeline.updateClip(clip.track.id,clip.id,{startTime:segment.timelineStart??start,duration:end-start});
        this.inspect();
    }
    beginTrim(event,segment,side) {
        if(event.button!==0 || this.busy)return;
        event.preventDefault();event.stopPropagation();this.endTrim?.();this.choose(segment);
        const rows=this.source.segments,index=rows.indexOf(segment),prev=rows[index-1],next=rows[index+1];
        const start=segment.start,end=segment.end,trackStart=segment.timelineStart??start;
        const min=Math.max(prev?.end??0,prev?start-trackStart+(prev.timelineStart??prev.start)+prev.end-prev.start:0);
        const max=Math.min(next?.start??this.source.duration,next?end+(next.timelineStart??next.start)-(trackStart+end-start):this.source.duration);
        const x=event.clientX,pps=this.timeline.pixelsPerSecond;let latest=x,frame=null,changed=false;
        const update=()=>{
            frame=null;const delta=(latest-x)/pps;
            const value=side==='left'?Math.max(Math.ceil(min*FPS)/FPS,Math.min(end-1/FPS,Math.round((start+delta)*FPS)/FPS)):
                Math.min(Math.floor(max*FPS)/FPS,Math.max(start+1/FPS,Math.round((end+delta)*FPS)/FPS));
            if(Math.abs(value-(side==='left'?segment.start:segment.end))<1e-8)return;
            if(!changed){this.remember();changed=true;}
            this.applyTrim(segment,side==='left'?value:start,side==='right'?value:end);
        };
        this.endTrim=bindDragSession(event,{onMove:e=>{latest=e.clientX;if(!frame)frame=requestAnimationFrame(update);},onEnd:()=>{
            if(frame){cancelAnimationFrame(frame);update();}this.endTrim=null;
            if(changed){this.updateTrackState();this.syncViewport();}
        }});
    }
    syncViewport() {
        const tl=this.timeline, min=(tl.scrollEl.scrollLeft-200)/tl.pixelsPerSecond;
        const max=(tl.scrollEl.scrollLeft+tl.scrollEl.clientWidth+200)/tl.pixelsPerSecond;
        for(const [segment,clip] of this.timelineClips){
            const visible=clip.endTime>=min && clip.startTime<=max;
            if(visible && !this.mountedClips.has(clip)){
                this.trainingTrack.el.append(clip.el);this.previewObserver.observe(clip.el);this.mountedClips.add(clip);
            }else if(!visible && this.mountedClips.has(clip)){
                if(this.hoverSegment===segment)this.stopHover();
                this.previewObserver.unobserve(clip.el);clip.el.remove();clip.el.querySelector('.ct-preview-icon')?.remove();this.mountedClips.delete(clip);
            }
        }
    }
    addPreviewButton(element,segment) {
        const preview=document.createElement('cap-button');
        preview.setAttribute('shape','square');preview.setAttribute('size','small');
        preview.setAttribute('aria-label',T('hoverPreview'));preview.title=T('hoverPreview');
        preview.innerHTML=iconHtml('video',14);preview.className='ct-preview-icon';
        preview.addEventListener('pointerenter',()=>this.startHover(segment));
        preview.addEventListener('pointerleave',()=>this.stopHover());
        preview.addEventListener('focusin',()=>this.startHover(segment));
        preview.addEventListener('focusout',()=>this.stopHover());
        preview.addEventListener('click',e=>e.stopPropagation());
        preview.addEventListener('pointerdown',e=>e.stopPropagation());
        element.append(preview);
    }
    toTrackTime(time) {
        const s=this.hoverSegment || this.source?.segments.find(s=>time>=s.start && time<=s.end);
        return s?(s.timelineStart??s.start)+time-s.start:time;
    }
    toSourceTime(time) {
        const s=this.source?.segments.find(s=>time>=(s.timelineStart??s.start) && time<(s.timelineStart??s.start)+s.end-s.start);
        return s?s.start+time-(s.timelineStart??s.start):time;
    }
    bindTrackMenu(track) {
        const icon=track.headerEl.querySelector('.tl-track-icon');
        const button=document.createElement('cap-dropdown-button');
        button.setAttribute('size','small');button.setAttribute('shape','square');button.setAttribute('variant','ghost');
        button.setAttribute('aria-label',T('trackMenu'));button.innerHTML=iconHtml('film',14);icon.replaceWith(button);
        const hide=()=>{clearTimeout(this.menuTimer);this.menuTimer=setTimeout(()=>this.trackMenu?.remove(),180);};
        const show=()=> {
            clearTimeout(this.menuTimer);this.trackMenu?.remove();
            const menu=document.createElement('cap-context-menu');this.trackMenu=menu;
            menu.setItems([{label:T('closeGaps'),icon:'scissors',action:'close-gaps',disabled:this.busy || !this.source.segments.length}]);
            this.append(menu);const rect=button.getBoundingClientRect();
            menu.style.left=`${Math.min(rect.right+4,innerWidth-menu.offsetWidth-8)}px`;
            menu.style.top=`${Math.max(8,Math.min(rect.top,innerHeight-menu.offsetHeight-8))}px`;
            menu.addEventListener('mouseenter',()=>clearTimeout(this.menuTimer));menu.addEventListener('mouseleave',hide);
            menu.addEventListener('menu-close',()=>menu.remove());
            menu.addEventListener('menu-select',e=>{menu.remove();this.action(e.detail.action).catch(error=>this.status.setStatus(error.message,'error'));});
        };
        button.bindMenu(show);button.addEventListener('mouseenter',show);button.addEventListener('mouseleave',hide);
    }
    updateTrackState() {
        const detect=this.querySelector('.ct-detect');
        if(detect && !this.detecting)detect.textContent=T(this.trackSelection.size?'detectSelected':'detect');
        for(const [segment,clip] of this.timelineClips || []) {
            const eligible=windowBounds(segment,this.settings.frames).eligible;
            const selected=this.trackSelection.has(segment.id);
            if(clip.selected!==selected)clip.setSelected(selected);
            const enabled=segment.selected;
            clip.setInsufficient(!eligible);
            if(clip.datasetEnabled!==enabled){clip.datasetEnabled=enabled;clip.setEnabled(enabled);}
            const title=`${segment.start.toFixed(2)}–${segment.end.toFixed(2)}s · ${segment.selected?T('enabled'):T('disabled')}${eligible?'':' · '+T('short')}`;
            if(clip.el.title!==title)clip.el.title=title;
        }
        this.save();
    }
    choose(segment, additive=false) {
        const previous=new Set(this.trackSelection);
        if(!additive)this.trackSelection.clear();
        if(additive && this.trackSelection.has(segment.id))this.trackSelection.delete(segment.id);
        else this.trackSelection.add(segment.id);
        this.current=segment;this.querySelector('[data-timeline]').focus({preventScroll:true});
        for(const id of new Set([...previous,...this.trackSelection])){
            const clip=this.clipBySegment.get(id), selected=this.trackSelection.has(id);
            if(clip && clip.selected!==selected)clip.setSelected(selected);
        }
        const detect=this.querySelector('.ct-detect');
        if(detect && !this.detecting)detect.textContent=T(this.trackSelection.size?'detectSelected':'detect');
        this.inspect();
        this.hoverSegment=null;this.pendingVideoTime=null;this.video.pause();this.video.currentTime=segment.offset;this.scheduleSave();
    }
    effectiveCrop(segment) { return this.settings.cropAll?this.settings.sharedCrop:segment?.crop; }
    startHover(segment) {
        if(!this.source?.token)return;
        this.cropPreview.configure(this.settings,this.effectiveCrop(segment),false);
        this.hoverSegment=segment;this.video.currentTime=segment.start;
        this.video.play().catch(error=>{if(error.name!=='AbortError')this.status.setStatus(error.message,'warning');});
    }
    stopHover() {
        if(!this.hoverSegment)return;
        this.hoverSegment=null;this.video.pause();
        this.cropPreview.configure(this.settings,this.effectiveCrop(this.current),(!!this.current || !!this.settings.cropAll) && !this.busy);
        if(this.current)this.video.currentTime=this.current.offset;
    }
    remember() {
        this.history.push(copyDatasetData(this.source.segments));
        if(this.history.length>20)this.history.shift();
    }
    inspect() {
        this.querySelector('[data-action="relink"]').disabled=!this.source || this.busy;
        this.cropPreview.configure(this.settings,this.effectiveCrop(this.current),(!!this.current || !!this.settings.cropAll) && !this.busy);
        const s=this.current,b=s?windowBounds(s,this.settings.frames):{eligible:false,min:0,max:0};
        this.querySelector('[data-title]').textContent=s?`${this.source.name} · ${this.source.segments.indexOf(s)+1}`:T('empty');
        this.querySelector('[data-range]').textContent=s?`${T('sceneStart')}: ${s.start.toFixed(3)}s · ${T('sceneEnd')}: ${s.end.toFixed(3)}s · ${T('duration')}: ${(s.end-s.start).toFixed(3)}s · ${s.selected?T('enabled'):T('disabled')}${b.eligible?'':' · '+T('short')}`:'';
        const check=this.querySelector('[data-selected]'); check.checked=!!s?.selected; check.disabled=!s || this.busy;
        const offset=this.querySelector('[data-offset]'); offset.disabled=!b.eligible; offset.min=b.min/FPS;offset.max=b.max/FPS;offset.value=s?.offset || 0;
        const slider=this.querySelector('[data-slider]');slider.disabled=!b.eligible;slider.min=b.min;slider.max=Math.max(b.min,b.max);slider.value=Math.round((s?.offset||0)*FPS);
        this.querySelector('[data-caption]').value=s?.caption || '';this.querySelector('[data-caption]').disabled=!s;
        this.querySelector('[data-action="auto"]').disabled=this.busy || !b.eligible;
        this.querySelector('[data-action="remove"]').disabled=this.busy || !this.trackSelection.size;
    }
    setOffset(frame) {
        if (!this.current || !Number.isFinite(frame)) return;
        const b=windowBounds(this.current,this.settings.frames);
        if (!b.eligible) return;
        this.current.offset=Math.max(b.min,Math.min(b.max,Math.round(frame)))/FPS;
        this.video.currentTime=this.current.offset; this.inspect(); this.save();
    }
    togglePlay() { this.hoverSegment=null; if (this.video.paused) this.video.play().catch(e=>this.status.setStatus(e.message,'warning')); else this.video.pause(); }
    async captionSegment(source,segment) {
        const value=this.querySelector('[data-agent]').value;
        if (!value) throw new Error(T('missingAgent'));
        const agent=value.startsWith('agent:')?{agent_id:value.slice(6)}:{model:value.slice(6)};
        const result=await this.job('/caption',{...this.settings,...segment,crop:this.effectiveCrop(segment),token:source.token,...agent});
        segment.caption=result.caption; segment.caption_origin=value; this.save(); this.inspect();
        this.status.setStatus(T('captionDone'),'success');
    }
    async action(action) {
        if (action==='cancel') { this.cancelBatch=true; if(this.jobId) await this.request(`/jobs/${this.jobId}/cancel`,{});this.status.setStatus(T('cancelWait'));return; }
        if (action==='play') { this.togglePlay();return; }
        if (action==='prev' || action==='next') {
            const rows=this.source?.segments || []; const i=rows.indexOf(this.current)+(action==='next'?1:-1);
            if(rows[i])this.choose(rows[i]);return;
        }
        if (this.busy) return;
        if (action==='import-json') {this.querySelector('[data-json-file]').click();return;}
        if (action==='export-json') {
            const data=exportProject(this.settings,this.sources,this.previewHeight);
            const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
            const link=document.createElement('a');link.href=url;link.download='training-dataset-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
            document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
        }
        if (action==='close') {this.save();this.remove();return;}
        if (action==='relink' && this.source) {this.relinkIndex=this.sources.indexOf(this.source);this.querySelector('[data-file]').click();return;}
        if (action==='add') {this.relinkIndex=null;this.querySelector('[data-file]').click();return;}
        if (action==='load') return this.perform(async()=>this.addSource(await this.request('/source',{path:this.querySelector('[data-path]').value})));
        if (action==='export') return this.perform(async()=> {
            for(const input of this.querySelectorAll('[data-setting]'))if(!input.checkValidity()){input.reportValidity();throw new Error(input.validationMessage);}
            const clips=selectedClips(this.sources,this.settings.frames).map(s=>({...s,crop:this.effectiveCrop(s)}));if(!clips.length)throw new Error(T('noClips'));
            const result=await this.job('/export',{...this.settings,clips});
            this.status.setStatus(`${T('done')}: ${result.count}\n${result.directory}`,'success');
        });
        if (action==='batch') return this.perform(async()=> {
            this.cancelBatch=false;
            for(const source of this.sources)for(const segment of source.segments) {
                if(this.cancelBatch)return;
                if(segment.selected && !segment.caption.trim() && windowBounds(segment,this.settings.frames).eligible)await this.captionSegment(source,segment);
            }
        });
        if (!this.source) return;
        if(action==='auto' && this.current)return this.perform(()=>this.captionSegment(this.source,this.current));
        if(action==='all' || action==='none') {
            this.remember();this.source.segments.forEach(s=>s.selected=action==='all');this.updateTrackState();this.inspect();return;
        }
        if(action==='undo') {
            if(this.history.length){this.source.segments=this.history.pop();this.current=null;this.trackSelection.clear();this.renderTimeline();this.updateTrackState();this.inspect();}return;
        }
        if(action==='trim-left' || action==='trim-right') {
            if(!this.current)return;
            const s=this.current,trackStart=s.timelineStart??s.start;
            const time=Math.round((s.start+this.timeline.currentTime-trackStart)*FPS)/FPS;
            if(time<=s.start || time>=s.end)return;
            this.remember();this.video.pause();
            this.applyTrim(s,action==='trim-left'?time:s.start,action==='trim-right'?time:s.end);
            this.updateTrackState();this.syncViewport();return;
        }
        if(action==='merge') {
            const rows=this.source.segments,targets=rows.filter(s=>this.trackSelection.has(s.id));
            if(targets.length<2)return;
            const first=targets[0],index=rows.indexOf(first);
            const contiguous=targets.every((s,i)=>!i || (rows[index+i]===s && Math.abs(targets[i-1].end-s.start)<1e-6 &&
                Math.abs((targets[i-1].timelineStart??targets[i-1].start)+targets[i-1].end-targets[i-1].start-(s.timelineStart??s.start))<1e-6));
            if(!contiguous){this.status.setStatus(T('mergeContinuous'),'warning');return;}
            this.remember();this.video.pause();
            const merged={...first,end:targets.at(-1).end,caption:[...new Set(targets.map(s=>s.caption.trim()).filter(Boolean))].join('\n'),caption_origin:'manual',selected:targets.some(s=>s.selected)};

            rows.splice(index,targets.length,merged);this.current=null;this.trackSelection.clear();
            this.renderTimeline();this.updateTrackState();this.choose(merged);return;
        }
        if(action==='close-gaps') {
            if(!this.source.segments.length)return;
            this.remember();let cursor=this.source.segments[0].timelineStart??this.source.segments[0].start;
            for(const s of this.source.segments){s.timelineStart=cursor;cursor+=s.end-s.start;}
            this.renderTimeline();this.updateTrackState();this.inspect();return;
        }
        if(action==='toggle' || action==='remove') {
            const targets=this.source.segments.filter(s=>this.trackSelection.has(s.id));
            if(!targets.length)return;
            if(action==='toggle') {
                this.remember();
                const enabled=targets.some(s=>!s.selected);
                targets.forEach(s=>s.selected=enabled);
                this.status.setStatus(`${T(enabled?'enabled':'disabled')}: ${targets.length}`,'success');
            } else {
                this.remember();
                this.video.pause();
                this.source.segments=this.source.segments.filter(s=>!this.trackSelection.has(s.id));
                this.current=null;this.trackSelection.clear();this.renderTimeline();
            }
            this.updateTrackState();this.inspect();return;
        }
        if(action==='mark') {
            const time=Math.round(this.video.currentTime*FPS)/FPS;
            const index=this.source.segments.findIndex(s=>s.start<time && s.end>time);
            if(index<0)return;
            this.remember();const segment=this.source.segments[index];
            const parts=scenesFromPoints([time-segment.start],segment.end-segment.start).map(s=>({...s,start:s.start+segment.start,end:s.end+segment.start,offset:s.offset+segment.start,...(segment.timelineStart!=null?{timelineStart:segment.timelineStart+s.start}:{})}));
            this.source.segments.splice(index,1,...parts);
            this.current=null;this.trackSelection.clear();this.renderTimeline();this.updateTrackState();this.inspect();return;
        }
        const rebuild=points=> {
            this.remember();
            this.source.segments=scenesFromPoints(points,this.source.duration,this.source.segments);
            this.current=null;this.trackSelection.clear();this.renderTimeline();this.updateTrackState();this.inspect();
        };
        if(action==='detect') {
            const targets=this.source.segments.filter(s=>this.trackSelection.has(s.id));
            this.detecting=true;this.cancelBatch=false;
            const button=this.querySelector('.ct-detect');button.dataset.action='cancel';button.textContent=T('cancelDetect');
            try {return await this.perform(async()=> {
                const result=await this.job('/detect',{token:this.source.token,...(targets.length?{ranges:targets.map(s=>({start:s.start,end:s.end}))}:{})});
                if(this.cancelBatch)throw new Error(T('detectCancelled'));
                if(targets.length) {
                    this.remember();
                    this.source.segments=this.source.segments.flatMap(s=>{
                        if(!targets.includes(s))return [s];
                        const points=result.points.filter(t=>t>s.start && t<s.end);
                        if(!points.length)return [s];
                        return scenesFromPoints(points.map(t=>t-s.start),s.end-s.start).map(part=>({...part,start:part.start+s.start,end:part.end+s.start,offset:part.offset+s.start,crop:s.crop?{...s.crop}:undefined,...(s.timelineStart!=null?{timelineStart:s.timelineStart+part.start}:{})}));
                    });
                    this.current=null;this.trackSelection.clear();this.renderTimeline();this.updateTrackState();this.inspect();
                }else rebuild(result.points);
                this.status.setStatus(`${this.source.segments.length} ${T('scenes')}`,'success');
            });}
            finally {this.detecting=false;const current=this.querySelector('.ct-detect');if(current){current.dataset.action='detect';current.textContent=T(this.trackSelection.size?'detectSelected':'detect');current.disabled=false;}}
        }
    }
    disconnectedCallback() {
        this.save();
        this.endTrim?.();this.viewportObserver?.disconnect();cancelAnimationFrame(this.viewportFrame);
        this.previewObserver?.disconnect();
        clearTimeout(this.menuTimer);this.trackMenu?.remove();
        this.abort?.abort();this.video?.pause();cancelAnimationFrame(this.raf);this.timeline?.destroy();window.removeEventListener('keydown',this.keyHandler,true);
        if(this.jobId)void this.request(`/jobs/${this.jobId}/cancel`,{}).catch(()=>{});
    }
}
customElements.define('cap-training-dataset-editor',TrainingDatasetEditor);
