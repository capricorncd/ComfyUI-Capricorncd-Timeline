import '../components/Button.js';
import '../components/FormControls.js';
import '../components/StatusMessage.js';
import '../components/ThemePicker.js';
import '../components/Disclosure.js';
import '../components/VideoCrop.js';
import '../components/Slider.js';
import { Timeline } from '../timeline/index.js';
import { loadExtensionCss } from '../cap_ui.js';
import { FPS, windowBounds, scenesFromPoints, normalizeSelection, selectedClips, copyDatasetData } from './model.js';
import { T } from './i18n.js';
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
        this.previewHeight = saved.previewHeight;
        this.settings = { width:512, height:256, frames:124, fit:'crop', ...saved.settings };
        this.sources = [];
        this.source=null; this.current=null; this.relinkIndex=null;
        this.restoring=true;
        this.limit = 100;
        this.history = [];
        this.abort = new AbortController();
        loadExtensionCss('cap_timeline_editor.css');
        loadExtensionCss('timeline/timeline.css');
        loadExtensionCss('training_dataset/editor.css');
        this.className = 'cat-te-overlay open cap-training-editor';
        this.setAttribute('role','region');
        this.setAttribute('aria-label',T('title'));
        this.innerHTML = `<header><h1>${T('title')}</h1><cap-button data-action="add">${T('add')}</cap-button><cap-select><select data-source aria-label="${T('add')}"></select></cap-select><cap-button data-action="relink">${T('relink')}</cap-button><cap-button data-action="import-json">${T('importJson')}</cap-button><cap-button data-action="export-json">${T('exportJson')}</cap-button><input data-json-file type="file" accept=".json,application/json" hidden><cap-button data-action="close">${T('close')}</cap-button></header>
          <div class="ct-import"><cap-input><input data-path placeholder="${T('path')}" aria-label="${T('path')}"></cap-input><cap-button data-action="load">${T('load')}</cap-button><input data-file type="file" accept="video/*,.mkv" multiple hidden></div>
          <main><section class="ct-preview"><cap-video-crop resize-label="${T('resizePreview')}" aria-label="${T('cropHint')}"><video muted playsinline preload="metadata"></video></cap-video-crop><div class="ct-tools"><label>${T('zoom')}<cap-slider default-value="1" reset-label="${T('resetCrop')}"><input data-zoom type="range" min="1" max="4" step="0.01" value="1"><output data-zoom-value>1.00×</output></cap-slider></label><cap-button data-crop-reset>${T('resetCrop')}</cap-button></div><p class="ct-hint">${T('cropHint')}</p><div class="ct-tools"><cap-button data-action="prev">${T('prev')}</cap-button><cap-button data-action="play">${T('play')}</cap-button><cap-button data-action="next">${T('next')}</cap-button><label><input data-loop type="checkbox" checked> ${T('loop')}</label></div><div class="ct-tools"><cap-button data-action="detect">${T('detect')}</cap-button><cap-button data-action="mark">${T('mark')}</cap-button><cap-button data-action="undo">${T('undo')}</cap-button></div><p class="ct-hint">${T('pointsHint')}</p><div class="ct-tools"><cap-button data-action="all">${T('all')}</cap-button><cap-button data-action="none">${T('none')}</cap-button><label><input data-only type="checkbox"> ${T('only')}</label></div><div data-scenes class="ct-scenes"></div><cap-button data-action="more">${T('more')}</cap-button></section>
          <aside><h2 data-title>${T('empty')}</h2><label><input data-selected type="checkbox"> ${T('select')}</label><p data-range class="ct-hint"></p><label>${T('start')}<cap-input><input data-offset type="number" min="0" step="0.0416666667"></cap-input></label><input data-slider type="range" step="1" aria-label="${T('start')}"><cap-button data-action="remove" variant="danger">${T('remove')}</cap-button>
          <label>${T('caption')}<cap-textarea><textarea data-caption rows="6"></textarea></cap-textarea></label><label>${T('agent')}<cap-select><select data-agent></select></cap-select></label><p class="ct-hint">${T('agentHint')}</p><cap-button data-action="auto">${T('auto')}</cap-button><cap-button data-action="batch">${T('batch')}</cap-button>
          <h2>${T('settings')}</h2><label>${T('resolution')}<cap-select data-resolution-control><select data-resolution required></select></cap-select></label><p class="ct-hint">${T('resolutionHint')}</p><label>${T('frames')}<cap-input><input data-setting="frames" type="number" min="124" max="345" step="17"></cap-input></label><label>${T('fit')}<cap-select><select data-setting="fit"><option value="crop">${T('crop')}</option><option value="pad">${T('pad')}</option></select></cap-select></label><cap-disclosure><span slot="title">${T('appearance')}</span><cap-theme-picker></cap-theme-picker></cap-disclosure></aside></main>
          <div data-timeline class="ct-timeline"></div><footer><span data-summary></span><cap-status-message closable close-label="${T('close')}"></cap-status-message><cap-button data-action="cancel" disabled>${T('cancel')}</cap-button><cap-button data-action="export" variant="primary">${T('export')}</cap-button><p class="ct-hint">${T('outputHint')}</p></footer>`;
        document.body.append(this);
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
        this.cropPreview = this.querySelector('cap-video-crop');
        if(this.previewHeight)this.cropPreview.setHeight(this.previewHeight);
        this.cropPreview.addEventListener('preview-resize',e=>{this.previewHeight=e.detail.height;this.save();});
        this.cropPreview.addEventListener('crop-change', e => {
            if (!this.current || this.busy) return;
            this.current.crop=e.detail; this.save();
        });
        this.querySelector('[data-zoom]').oninput=e=> {
            if (!this.current || this.busy) return;
            this.current.crop={zoom:1,x:.5,y:.5,...this.current.crop,zoom:Number(e.target.value)};
            this.inspect(); this.save();
        };
        this.querySelector('[data-crop-reset]').onclick=()=> {
            if (!this.current || this.busy) return;
            this.current.crop={zoom:1,x:.5,y:.5}; this.inspect(); this.save();
        };
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
        this.querySelector('[data-only]').onchange = () => { this.limit=100; this.renderScenes(); };
        this.querySelector('[data-selected]').onchange = e => {
            if (this.current) { this.current.selected=e.target.checked; this.save(); this.renderScenes(); }
        };
        this.querySelector('[data-caption]').oninput = e => {
            if (this.current) { this.current.caption=e.target.value; this.current.caption_origin='manual'; this.save(); }
        };
        this.querySelector('[data-offset]').onchange = e => this.setOffset(Number(e.target.value)*FPS);
        this.querySelector('[data-slider]').oninput = e => this.setOffset(Number(e.target.value));
        for (const input of this.querySelectorAll('[data-setting]')) input.onchange = () => {
            if (!input.checkValidity()) { input.reportValidity(); return; }
            this.settings[input.dataset.setting] = input.type === 'number' ? Number(input.value) : input.value;
            normalizeSelection(this.sources,this.settings.frames); this.renderScenes(); this.inspect(); this.save();
        };
        this.video.addEventListener('error',() => this.status.setStatus(this.video.error?.message || T('error'),'error'),{signal:this.abort.signal});
        this.video.addEventListener('ended',()=> {
            if(this.current && this.querySelector('[data-loop]').checked) {
                this.video.currentTime=this.current.offset;this.video.play().catch(e=>this.status.setStatus(e.message,'warning'));
            }
        },{signal:this.abort.signal});
        this.keyHandler = e => {
            if (e.composedPath().some(el => el.matches?.('input,textarea,select,[contenteditable="true"]'))) return;
            if (e.code==='Space' && e.composedPath().some(el=>el.matches?.('cap-button,video'))) return;
            if (e.code === 'KeyM' || e.code === 'Space' || e.code === 'Escape') {
                e.preventDefault(); e.stopImmediatePropagation();
                this.action(e.code==='KeyM'?'mark':e.code==='Space'?'play':'close').catch(error => this.status.setStatus(error.message,'error'));
            }
        };
        window.addEventListener('keydown',this.keyHandler,true);
        this.tick = () => {
            if (!this.isConnected) return;
            if (this.current && this.querySelector('[data-loop]').checked && !this.video.paused && !this.video.seeking) {
                const end = this.current.offset + this.settings.frames/FPS;
                if (this.video.currentTime >= Math.min(end,this.current.end) - .015 || this.video.currentTime < this.current.offset - .05) this.video.currentTime=this.current.offset;
            }
            this.timeline?.setCurrentTime(this.video.currentTime || 0,{userSeek:false});
            this.raf=requestAnimationFrame(this.tick);
        };
        this.raf=requestAnimationFrame(this.tick);
        await this.perform(async () => {
            this.restoring=true;
            for (const src of saved.sources || []) {
                try { const restored = await this.request('/source',{path:src.path}); this.addSource({...src,...restored,name:src.name || restored.name,keepMissing:false}); }
                catch (error) {
                    if (!src.keepMissing && /\[(?:WinError [23]|Errno 2)\]/.test(error.message)) continue;
                    this.sources.push({...src,token:null});
                    this.querySelector('[data-source]').add(new Option(`${src.name} (${T('error')})`,String(this.sources.length-1)));
                    this.status.setStatus(`${src.name}: ${error.message}`,'warning');
                }
            }
            if(!this.source && this.sources.length)this.switchSource(0);
            this.restoring=false;
            try {
                const response=await fetch(this.apiURL('/audio_keyframe_timeline/vl_models'));
                if (!response.ok) throw new Error(T('missingAgent'));
                const data=await response.json();
                const select=this.querySelector('[data-agent]');
                select.replaceChildren(new Option(T('agent'),''));
                for (const model of data.models || []) select.add(new Option(model,`model:${model}`));
                for (const agent of data.agents || []) select.add(new Option(agent.label || agent.model,`agent:${agent.id}`));
                if (select.options.length===1) this.status.setStatus(T('missingAgent'),'warning');
            } catch (error) { this.status.setStatus(error.message,'warning'); }
        });
        this.renderScenes();
        this.save();
    }
    async request(path, body) {
        const response=await fetch(this.apiURL(PREFIX+path),body === undefined ? {} : body instanceof FormData ? {method:'POST',body} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return readDatasetResponse(response, PREFIX+path, {restart:T('restartBackend'),invalid:T('invalidResponse')});
    }
    save() {
        if (!this.restoring) this.onSave({version:1,previewHeight:this.previewHeight,settings:this.settings,sources:this.sources.map(({token,...source})=>source)});
        const selected=selectedClips(this.sources,this.settings.frames);
        this.querySelector('[data-summary]').textContent=`${T('selected')}: ${selected.length} · ${T('blank')}: ${selected.filter(s=>!s.caption.trim()).length} · ${this.settings.frames}f / ${(this.settings.frames/FPS).toFixed(3)}s`;
    }
    async perform(callback) {
        if (this.busy) return;
        this.busy=true;
        this.querySelector('aside').inert=true;
        this.querySelector('.ct-import').inert=true;
        for (const b of this.querySelectorAll('[data-action]')) b.disabled=!['cancel','play','prev','next'].includes(b.dataset.action);
        this.querySelector('[data-source]').disabled=true;
        this.renderScenes();
        try { return await callback(); }
        finally {
            this.busy=false; this.querySelector('aside').inert=false; this.querySelector('.ct-import').inert=false;
            for (const b of this.querySelectorAll('[data-action]')) b.disabled=b.dataset.action==='cancel';
            this.querySelector('[data-source]').disabled=false;
            this.inspect();this.renderScenes();
        }
    }
    async job(path,payload) {
        this.jobId=(await this.request(path,payload)).job;
        try {
            while (this.isConnected) {
                const result=await this.request(`/jobs/${this.jobId}`);
                this.status.setStatus(`${T('busy')} ${result.done}/${result.total}`);
                if (result.state==='complete') return result.result;
                if (result.state==='failed') throw new Error(`${result.error}${result.directory ? '\n'+result.directory : ''}`);
                if (result.state==='cancelled') throw new Error(T('cancelled'));
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
        this.video.pause(); this.current=null;
        this.source=this.sources[index];
        this.querySelector('[data-source]').value=String(index);
        if(this.source.token){this.video.src=this.apiURL(`${PREFIX}/media/${this.source.token}`);this.status.setStatus('');}
        else {this.video.removeAttribute('src');this.video.load();this.status.setStatus(`${this.source.name}: ${T('missingSource')}`,'warning');}
        this.history=[]; this.limit=100;
        this.renderTimeline(); this.renderScenes(); this.inspect(); this.save();
    }
    renderTimeline() {
        this.timeline?.destroy();
        const host=this.querySelector('[data-timeline]'); host.replaceChildren();
        if (!this.source) return;
        this.timeline=new Timeline(host,{duration:this.source.duration,fps:FPS,timeFormat:'ms',minZoom:.001,zoom:Math.max(.001,Math.min(1,host.clientWidth/(this.source.duration*80))),addTrackTypes:[]});
        const track=this.timeline.addTrack({type:'video',name:this.source.name});
        this.timelineClips=[];
        this.source.segments.forEach((segment,index)=> {
            const clip=this.timeline.addClip(track.id,{name:String(index+1),startTime:segment.start,duration:segment.end-segment.start});
            clip.el.addEventListener('click',()=>this.choose(segment));
            this.timelineClips.push([segment,clip]);
        });
        track.setLocked(true);
        this.timeline.on('seek',({time})=> { this.querySelector('[data-loop]').checked=false; this.video.currentTime=time; });
        this.timeline.on('play',()=> { this.timeline.pause(); this.togglePlay(); });
        this.timeline.on('key',e=> { if (e.code==='Space') {e.preventDefault();this.togglePlay();} });
    }
    renderScenes() {
        const host=this.querySelector('[data-scenes]'); host.replaceChildren();
        const rows=(this.source?.segments || []).filter(s=>!this.querySelector('[data-only]').checked || windowBounds(s,this.settings.frames).eligible);
        rows.slice(0,this.limit).forEach(segment=> {
            const i=this.source.segments.indexOf(segment), bounds=windowBounds(segment,this.settings.frames);
            const row=document.createElement('div'); row.className='ct-scene';
            const check=document.createElement('input'); check.type='checkbox'; check.checked=segment.selected;
            check.disabled=!bounds.eligible || this.busy; check.setAttribute('aria-label',`${T('select')} ${i+1}`);
            check.onchange=()=> { segment.selected=check.checked; this.save(); this.inspect(); };
            const button=document.createElement('cap-button'); button.setAttribute('variant','card'); button.setAttribute('size','content');button.setAttribute('align','start');button.setAttribute('aria-pressed',String(segment===this.current));
            button.textContent=`${i+1} · ${segment.start.toFixed(2)}–${segment.end.toFixed(2)}s · ${(segment.end-segment.start).toFixed(2)}s${bounds.eligible?'':` · ${T('short')}`}`;
            button.onclick=()=>this.choose(segment);
            row.append(check,button); host.append(row);
        });
        this.querySelector('[data-action="more"]').hidden=rows.length<=this.limit;
        if (!rows.length) host.textContent=T('empty');
        for(const [segment,clip] of this.timelineClips || [])clip.setSelected(segment===this.current);
        this.save();
    }
    choose(segment) {
        this.current=segment; this.inspect(); this.renderScenes();
        this.querySelector('[data-loop]').checked=true;
        this.video.currentTime=segment.offset;
        this.video.play().catch(error=>this.status.setStatus(error.message,'warning'));
    }
    inspect() {
        this.querySelector('[data-action="relink"]').disabled=!this.source || this.busy;
        this.cropPreview.configure(this.settings,this.current?.crop,!!this.current && !this.busy);
        const zoom=this.querySelector('[data-zoom]');
        zoom.value=this.current?.crop?.zoom || 1;
        zoom.disabled=!this.current || this.busy || this.settings.fit!=='crop';
        this.querySelector('[data-zoom-value]').textContent=Number(zoom.value).toFixed(2)+'×';
        this.querySelector('[data-crop-reset]').disabled=zoom.disabled;
        const s=this.current,b=s?windowBounds(s,this.settings.frames):{eligible:false,min:0,max:0};
        this.querySelector('[data-title]').textContent=s?`${this.source.name} · ${this.source.segments.indexOf(s)+1}`:T('empty');
        this.querySelector('[data-range]').textContent=s?`${s.start.toFixed(3)}–${s.end.toFixed(3)}s · ${b.eligible?(s.offset+this.settings.frames/FPS).toFixed(3)+'s':T('short')}`:'';
        const check=this.querySelector('[data-selected]'); check.checked=!!s?.selected; check.disabled=!b.eligible;
        const offset=this.querySelector('[data-offset]'); offset.disabled=!b.eligible; offset.min=b.min/FPS;offset.max=b.max/FPS;offset.value=s?.offset || 0;
        const slider=this.querySelector('[data-slider]');slider.disabled=!b.eligible;slider.min=b.min;slider.max=Math.max(b.min,b.max);slider.value=Math.round((s?.offset||0)*FPS);
        this.querySelector('[data-caption]').value=s?.caption || '';this.querySelector('[data-caption]').disabled=!s;
        this.querySelector('[data-action="auto"]').disabled=this.busy || !b.eligible;
        this.querySelector('[data-action="remove"]').disabled=this.busy || !s || s.start===0;
    }
    setOffset(frame) {
        if (!this.current || !Number.isFinite(frame)) return;
        const b=windowBounds(this.current,this.settings.frames);
        if (!b.eligible) return;
        this.current.offset=Math.max(b.min,Math.min(b.max,Math.round(frame)))/FPS;
        this.video.currentTime=this.current.offset; this.inspect(); this.save();
    }
    togglePlay() { if (this.video.paused) this.video.play().catch(e=>this.status.setStatus(e.message,'warning')); else this.video.pause(); }
    async captionSegment(source,segment) {
        const value=this.querySelector('[data-agent]').value;
        if (!value) throw new Error(T('missingAgent'));
        const agent=value.startsWith('agent:')?{agent_id:value.slice(6)}:{model:value.slice(6)};
        const result=await this.job('/caption',{...this.settings,...segment,token:source.token,...agent});
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
        if (action==='more') {this.limit+=100;this.renderScenes();return;}
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
            const clips=selectedClips(this.sources,this.settings.frames);if(!clips.length)throw new Error(T('noClips'));
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
            this.source.segments.forEach(s=>s.selected=action==='all' && windowBounds(s,this.settings.frames).eligible);this.renderScenes();this.inspect();return;
        }
        if(action==='undo') {
            if(this.history.length){this.source.segments=this.history.pop();this.current=null;this.renderTimeline();this.renderScenes();this.inspect();}return;
        }
        const rebuild=points=> {
            this.history.push(copyDatasetData(this.source.segments));
            if(this.history.length>20)this.history.shift();
            this.source.segments=scenesFromPoints(points,this.source.duration,this.source.segments);
            this.current=null;this.renderTimeline();this.renderScenes();this.inspect();
        };
        if(action==='detect')return this.perform(async()=> {const result=await this.job('/detect',{token:this.source.token});rebuild(result.points);this.status.setStatus(`${this.source.segments.length} ${T('scenes')}`,'success');});
        if(action==='mark')rebuild([...this.source.segments.map(s=>s.start),Math.round(this.video.currentTime*FPS)/FPS]);
        if(action==='remove' && this.current?.start>0)rebuild(this.source.segments.map(s=>s.start).filter(t=>t!==this.current.start));
    }
    disconnectedCallback() {
        this.abort?.abort();this.video?.pause();cancelAnimationFrame(this.raf);this.timeline?.destroy();window.removeEventListener('keydown',this.keyHandler,true);
        if(this.jobId)void this.request(`/jobs/${this.jobId}/cancel`,{}).catch(()=>{});
    }
}
customElements.define('cap-training-dataset-editor',TrainingDatasetEditor);
