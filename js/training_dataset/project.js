const FORMAT='capricorncd-training-dataset';
export function exportProject(settings, sources, previewHeight) {
    return {format:FORMAT,version:1,settings:{...settings},previewHeight,
        sources:sources.map(({token,...source})=>source)};
}

export function importProject(text) {
    const data=JSON.parse(text.replace(/^\uFEFF/,''));
    const fail=()=>{throw new Error('Invalid training dataset JSON');};
    const num=(value,min,max)=>typeof value==='number' && Number.isFinite(value) && value>=min && value<=max;
    if(data?.format!==FORMAT || data.version!==1 || !Array.isArray(data.sources) || data.sources.length>200)fail();
    const s=data.settings;
    if(!s || ![s.width,s.height].every(n=>num(n,64,2048) && n%32===0) || !num(s.frames,124,345) || (s.frames-5)%17 || !['crop','pad'].includes(s.fit))fail();
    let count=0;
    const sources=data.sources.map(src=> {
        if(!src || typeof src.path!=='string' || !src.path || typeof src.name!=='string' || !num(src.duration,.001,864000) || ![src.width,src.height].every(n=>num(n,1,65536)) || !Array.isArray(src.segments))fail();
        count+=src.segments.length;if(count>50000)fail();
        let end=0;
        const segments=src.segments.map(seg=> {
            if(!seg || !num(seg.start,end,src.duration) || !num(seg.end,seg.start,src.duration) || seg.end<=seg.start || !num(seg.offset,seg.start,seg.end) || typeof seg.caption!=='string' || seg.caption.length>32000 || typeof seg.selected!=='boolean')fail();
            end=seg.end;
            const crop=seg.crop || {zoom:1,x:.5,y:.5};
            if(!num(crop.zoom,1,4) || !num(crop.x,0,1) || !num(crop.y,0,1))fail();
            return {id:typeof seg.id==='string'?seg.id:crypto.randomUUID(),start:seg.start,end:seg.end,offset:seg.offset,selected:seg.selected,caption:seg.caption,
                caption_origin:typeof seg.caption_origin==='string'?seg.caption_origin:'manual',crop:{zoom:crop.zoom,x:crop.x,y:crop.y}};
        });
        return {path:src.path,name:src.name,width:src.width,height:src.height,duration:src.duration,segments,keepMissing:true};
    });
    return {version:1,settings:{width:s.width,height:s.height,frames:s.frames,fit:s.fit},sources,
        previewHeight:num(data.previewHeight,140,5000)?data.previewHeight:undefined};
}
