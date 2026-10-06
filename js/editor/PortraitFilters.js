export const FILTER_PRESETS = ['fair', 'bright', 'natural'];

export function activePortraitFilters(tracks, meta, time, info) {
    return [...tracks].reverse().flatMap(track => {
        if (track.type !== 'filter' || !track.visible || info?.get(track.id)?.enabled === false) return [];
        return track.clips.filter(clip => time >= clip.startTime && time < clip.endTime).flatMap(clip => {
            const m = meta.get(clip.id);
            return m && !m.disabled && m.visible !== false && m.filterStrength > 0
                ? [{ preset: m.filterPreset, strength: m.filterStrength }] : [];
        });
    });
}

// The same sampled RGB cube is consumed by FFmpeg's trilinear LUT filter.
export class PortraitFilterRenderer {
    constructor(refresh) {
        this.ready = fetch(new URL('../filters/portrait.json', import.meta.url)).then(response => {
            if (!response.ok) throw new Error('Portrait filters could not be loaded');
            return response.json();
        }).then(data => { this.data = data; refresh(); });
        this.ready.catch(error => console.error('[CapTE] portrait filters', error));
    }

    _init() {
        this.canvas = document.createElement('canvas');
        const gl = this.gl = this.canvas.getContext('webgl2', { alpha: false, preserveDrawingBuffer: true });
        if (!gl) return;
        const shader = (type, source) => {
            const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
            in vec2 position; out vec2 uv;
            void main(){ uv=(position+1.0)*0.5; gl_Position=vec4(position,0,1); }`);
        const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
            precision highp float;
            uniform sampler2D frame; uniform highp sampler3D lut;
            uniform float strength; uniform float size;
            in vec2 uv; out vec4 result;
            void main(){
                vec4 c=texture(frame,vec2(uv.x,1.0-uv.y));
                vec3 p=clamp(c.rgb,0.0,1.0)*(size-1.0);
                ivec3 a=ivec3(floor(p)), b=min(a+1,ivec3(int(size)-1)); vec3 f=fract(p);
                vec3 lo=mix(mix(texelFetch(lut,a,0).rgb,texelFetch(lut,ivec3(b.x,a.y,a.z),0).rgb,f.x),
                    mix(texelFetch(lut,ivec3(a.x,b.y,a.z),0).rgb,texelFetch(lut,ivec3(b.x,b.y,a.z),0).rgb,f.x),f.y);
                vec3 hi=mix(mix(texelFetch(lut,ivec3(a.x,a.y,b.z),0).rgb,texelFetch(lut,ivec3(b.x,a.y,b.z),0).rgb,f.x),
                    mix(texelFetch(lut,ivec3(a.x,b.y,b.z),0).rgb,texelFetch(lut,b,0).rgb,f.x),f.y);
                result=vec4(mix(c.rgb,mix(lo,hi,f.z),strength),c.a);
            }`);
        const program = this.program = gl.createProgram();
        gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
        gl.deleteShader(vertex); gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.frame = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.frame);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program, 'frame'), 0);
        gl.uniform1i(gl.getUniformLocation(program, 'lut'), 1);
        gl.uniform1f(gl.getUniformLocation(program, 'size'), this.data.size);
        this.textures = new Map();
        for (const [preset, colors] of Object.entries(this.data.presets)) {
            const rgba = new Float32Array(colors.length / 3 * 4);
            for (let i=0; i<colors.length/3; i++) rgba.set([...colors.slice(i*3,i*3+3),1],i*4);
            const texture=gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D,texture);
            gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
            gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA32F,this.data.size,this.data.size,this.data.size,0,gl.RGBA,gl.FLOAT,rgba);
            this.textures.set(preset,texture);
        }
    }

    apply(canvas, filters) {
        if (!filters.length || !this.data) return;
        if (!this.canvas) this._init();
        const gl = this.gl;
        if (!gl) {
            const ctx=canvas.getContext('2d'), image=ctx.getImageData(0,0,canvas.width,canvas.height);
            for (const filter of filters) applyLutPixels(image.data,this.data,filter.preset,filter.strength);
            ctx.putImageData(image,0,0); return;
        }
        if (this.canvas.width!==canvas.width || this.canvas.height!==canvas.height) {
            this.canvas.width=canvas.width; this.canvas.height=canvas.height;
        }
        gl.viewport(0,0,canvas.width,canvas.height); gl.useProgram(this.program);
        const ctx=canvas.getContext('2d');
        for (const filter of filters) {
            const texture=this.textures.get(filter.preset); if (!texture) continue;
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.frame);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D,texture);
            gl.uniform1f(gl.getUniformLocation(this.program,'strength'),filter.strength);
            gl.drawArrays(gl.TRIANGLE_STRIP,0,4); ctx.drawImage(this.canvas,0,0);
        }
    }

    dispose() {
        const gl=this.gl; if (!gl) return;
        this.textures.forEach(texture=>gl.deleteTexture(texture));
        gl.deleteTexture(this.frame); gl.deleteBuffer(this.buffer); gl.deleteProgram(this.program);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
}

export function applyLutPixels(pixels, data, preset, strength) {
    const colors=data.presets[preset]; if (!colors) return;
    const n=data.size;
    for(let i=0;i<pixels.length;i+=4){
        const p=[pixels[i],pixels[i+1],pixels[i+2]].map(v=>v/255*(n-1));
        const a=p.map(Math.floor), b=a.map(v=>Math.min(v+1,n-1)), f=p.map((v,k)=>v-a[k]);
        for(let channel=0;channel<3;channel++){
            let value=0;
            for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
                const index=(((z?b[2]:a[2])*n+(y?b[1]:a[1]))*n+(x?b[0]:a[0]))*3+channel;
                value+=colors[index]*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
            }
            pixels[i+channel]=Math.round(pixels[i+channel]+(value*255-pixels[i+channel])*strength);
        }
    }
}
