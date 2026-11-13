/* ============================================
   Whiplash 3D — the kit
   ============================================
   The pieces every panel is built from: the renderer and its light, glass slabs, text drawn into
   canvases, the badge disc, keys, flat paint swatches, springs, and picking with the mouse.

   Units: one unit is one pixel of a 1440p screen ("D"). The camera is placed so the z = 0 plane shows
   exactly 1440 units top to bottom, whatever the window, so a layout written in D keeps its share of
   the screen at any resolution. Every widget's own origin is its
   top-left corner, x right and y DOWN in layout terms (stored as -y in the scene). */

import * as THREE from 'three';

export { THREE };

// Two faces: Inter for the text, Rajdhani (squared, motorsport) for names and titles, asked for
// with text(..., { display: true }). Rajdhani draws small for its size, so display text is set DISPLAY_SCALE larger.
export const FONT = "'Inter', 'Segoe UI', system-ui, sans-serif";
export const DISPLAY = "'Rajdhani', 'Inter', 'Segoe UI', sans-serif";
const DISPLAY_SCALE = 1.14;

// whip's tokens (whip_core/html/css/base.css) in the Rally Blue & Yellow palette: the accent is rally yellow, and the
// filled pieces (keys, the selected row, a previewing card) fill yellow with navy ink.
export const COL = {
    text:   'rgba(255, 255, 255, 0.93)',
    mid:    'rgba(255, 255, 255, 0.5)',
    label:  'rgba(255, 255, 255, 0.48)',
    dim:    'rgba(255, 255, 255, 0.25)',
    faint:  'rgba(255, 255, 255, 0.08)',
    accent: '#ffd200',
    accentLight: 'rgba(255, 210, 0, 0.16)',
    ink:    'rgb(12, 30, 74)',
    inkMid: 'rgba(12, 30, 74, 0.62)',
    inkDim: 'rgba(12, 30, 74, 0.42)',
    pink:   '#f0468c',
};

export const H = 1440;          // the layout's height in D
export const FOV = 28;          // vertical field of view: enough perspective to read as 3D, little distortion

/* ---- the stage -------------------------------------------------------------------------------- */

export class Stage {
    constructor(host) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
        const r = this.renderer;
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        r.setClearColor(0x000000, 0);
        r.outputColorSpace = THREE.SRGBColorSpace;
        // Khronos PBR Neutral: keeps paint colours true while taming highlights.
        r.toneMapping = THREE.NeutralToneMapping;
        r.toneMappingExposure = 1.0;
        r.localClippingEnabled = true;
        host.appendChild(r.domElement);
        this.canvas = r.domElement;
        this.canvas.className = 'stage';

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 12000);
        this.dist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
        this.camera.position.set(0, 0, this.dist);

        // design (x, y) -> scene (x - W/2, H/2 - y): the root's origin is the screen's top-left.
        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.scene.environment = studioEnvironment(r);
        this.scene.environmentIntensity = 1.0;
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(-0.4, 1, 0.9);
        this.scene.add(key);

        this.maxAniso = r.capabilities.getMaxAnisotropy();
        this.W = 2560;
        this.resize();
        window.addEventListener('resize', () => { this.resize(); wake(); });
    }

    resize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.W = H * w / h;
        this.root.position.set(-this.W / 2, H / 2, 0);
        // Text is drawn this many canvas pixels per D: sharp at the window's size, never wasteful.
        this.texScale = Math.max(1, Math.min(2, (h / H) * 1.25 * Math.min(window.devicePixelRatio || 1, 2)));
        this.pxPerD = h / H;
        if (this.onResize) this.onResize();
    }

    render() { this.renderer.render(this.scene, this.camera); }

    /** A design-space point (x, y, z) inside `obj` to screen pixels. */
    toScreen(obj, x, y, z = 0) {
        const v = new THREE.Vector3(x, -y, z);
        obj.localToWorld(v);
        v.project(this.camera);
        return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
    }
}

/* A small photo studio, baked once into the environment map: a soft top light that makes every bevel's
   top edge shine, side strips for the edges, a faint panel behind the viewer for a sheen on the faces. */
function studioEnvironment(renderer) {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.BackSide }));
    env.add(room);
    const panel = (w, h, x, y, z, rx, ry, intensity, color = 0xffffff) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        m.material.color.multiplyScalar(intensity);
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, 0);
        env.add(m);
    };
    panel(14, 5, 0, 9.5, 0, Math.PI / 2, 0, 3.2);            // top softbox
    panel(3, 12, -9.5, 1, 0, 0, Math.PI / 2, 1.6);           // left strip
    panel(3, 12, 9.5, 1, 0, 0, -Math.PI / 2, 1.3);           // right strip
    panel(16, 6, 0, 4, 9.5, 0, Math.PI, 0.55, 0xdde6ff);     // behind the viewer: the faces' sheen
    panel(16, 4, 0, -9.5, 0, -Math.PI / 2, 0, 0.12);         // floor bounce
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(env, 0.035).texture;
    pm.dispose();
    return tex;
}

/* ---- the frame loop: draws only while something moves ------------------------------------------ */

const movers = new Set();     // { step(dt) -> still moving? }
let stageRef = null, dirty = true, raf = 0, last = 0, inFrame = false;
const frameHooks = [];
/** For the tests: what keeps the loop running (frames: frame() calls, draws: renders). */
export const loopDebug = { movers, wakes: 0, frames: 0, draws: 0 };

export function startLoop(stage) {
    stageRef = stage;
    wake();
}

/** Something changed: draw the next frame. Never more than one frame is asked for at a time. */
export function wake() {
    loopDebug.wakes++;
    dirty = true;
    // Inside a frame, the frame itself asks for the next one at its end. Asking here as well started a second
    // loop alongside the first, and every wake during a frame (a row redrawn as the paint list scrolled) added
    // another: the page drew the same frame 15 times per refresh after some scrolling, slower and slower.
    if (!raf && !inFrame) raf = requestAnimationFrame(frame);
}

export function onFrame(fn) { frameHooks.push(fn); }

export function animate(m) { movers.add(m); wake(); }

function frame(t) {
    raf = 0;
    inFrame = true;
    loopDebug.frames++;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    let moving = false;
    // A spring that settles this frame changed the scene too: its last step must be drawn. (Skipping it left the
    // shop's last frame before closing on screen for good: the crumbs and the cards' shadows at the bottom.)
    const stepped = movers.size > 0;
    try {
        for (const m of movers) {
            if (m.step(dt)) moving = true;
            else movers.delete(m);
        }
        for (const fn of frameHooks) if (fn(dt)) moving = true;
        const draw = dirty || moving || stepped;
        dirty = false;
        if (stageRef && draw) { stageRef.render(); loopDebug.draws++; }
    } finally {
        inFrame = false;
    }
    // the one request for the next frame: while anything moves, or something woke the page during this one
    if (moving || movers.size || dirty) { if (!raf) raf = requestAnimationFrame(frame); }
    else last = 0;
}

/* ---- springs ----------------------------------------------------------------------------------- */

/** A value that eases to its target: critically damped unless `bounce` (0..1) asks for overshoot. */
export class Spring {
    constructor(v = 0, stiffness = 260, bounce = 0, onChange = null) {
        this.v = v; this.t = v; this.vel = 0;
        this.k = stiffness;
        this.c = 2 * Math.sqrt(stiffness) * (1 - bounce);
        this.onChange = onChange;
    }
    to(t) {
        if (t === this.t && this.v === t) return this;
        this.t = t;
        animate(this);
        return this;
    }
    set(v) { this.v = this.t = v; this.vel = 0; if (this.onChange) this.onChange(v); wake(); return this; }
    step(dt) {
        // Sub-steps keep a stiff spring stable at 30 fps.
        const n = Math.ceil(dt / (1 / 120));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            const f = -this.k * (this.v - this.t) - this.c * this.vel;
            this.vel += f * h;
            this.v += this.vel * h;
        }
        const done = Math.abs(this.v - this.t) < 0.02 && Math.abs(this.vel) < 0.05;
        if (done) { this.v = this.t; this.vel = 0; }
        if (this.onChange) this.onChange(this.v);
        return !done;
    }
}

/* ---- text -------------------------------------------------------------------------------------- */

let fontsReady = false;
const fontWaiters = [];

/** Resolves once Inter and Rajdhani are in (or failed: the fallback draws). Redraws every label after. */
export function loadFonts() {
    const faces = ['500', '600', '700', '800'].map((w) => `${w} 24px 'Inter'`)
        .concat(["600 24px 'Rajdhani'", "700 24px 'Rajdhani'"]);
    const tries = faces.map((f) => document.fonts.load(f).catch(() => null));
    return Promise.race([Promise.all(tries), new Promise((r) => setTimeout(r, 2500))]).then(() => {
        fontsReady = true;
        fontWaiters.splice(0).forEach((f) => f());
    });
}
export function afterFonts(fn) { if (fontsReady) fn(); else fontWaiters.push(fn); }

export function font(size, weight = 600, display = false) {
    return display ? `${weight} ${Math.round(size * DISPLAY_SCALE * 10) / 10}px ${DISPLAY}` : `${weight} ${size}px ${FONT}`;
}

/** Draws one line of text; `max` truncates with an ellipsis. Returns the drawn width. */
export function text(ctx, str, x, y, { size = 24, weight = 600, color = COL.text, spacing = 0, align = 'left', max = 0, base = 'alphabetic', upper = false, display = false } = {}) {
    str = String(str ?? '');
    if (upper) str = str.toUpperCase();
    ctx.font = font(size, weight, display);
    ctx.letterSpacing = spacing ? `${spacing * size}px` : '0px';
    ctx.textBaseline = base;
    ctx.fillStyle = color;
    let w = ctx.measureText(str).width;
    if (max && w > max) {
        while (str.length > 1 && ctx.measureText(str + '…').width > max) str = str.slice(0, -1);
        str = str.trimEnd() + '…';
        w = ctx.measureText(str).width;
    }
    const dx = align === 'right' ? -w : align === 'center' ? -w / 2 : 0;
    ctx.textAlign = 'left';
    ctx.fillText(str, x + dx, y);
    return w;
}

export function measure(ctx, str, size, weight = 600, spacing = 0, upper = false, display = false) {
    ctx.font = font(size, weight, display);
    ctx.letterSpacing = spacing ? `${spacing * size}px` : '0px';
    return ctx.measureText(upper ? String(str).toUpperCase() : String(str)).width;
}

/** Splits text into the lines it takes at width `max`. */
export function wrapLines(ctx, str, max, size = 24, weight = 500, display = false) {
    ctx.font = font(size, weight, display);
    ctx.letterSpacing = '0px';
    const words = String(str || '').split(/\s+/).filter(Boolean);
    const out = [];
    let cur = '';
    for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width <= max || !cur) cur = t;
        else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
}

/** Wraps text into at most `lines` lines of width `max`; the last is cut with an ellipsis. */
export function wrap(ctx, str, x, y, max, lineH, lines, opts) {
    const out = wrapLines(ctx, str, max, opts.size || 24, opts.weight || 500, !!opts.display);
    const shown = out.slice(0, lines);
    if (out.length > lines) shown[lines - 1] = shown[lines - 1] + ' ' + out.slice(lines).join(' ');
    shown.forEach((l, i) => text(ctx, l, x, y + i * lineH, Object.assign({}, opts, { max })));
    return shown.length;
}

export function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** A keyboard key chip ("enter", "↑"), as whip's flat hints draw them. Returns its width. */
export function kbd(ctx, label, x, y, size, { ink = false } = {}) {
    const w = measure(ctx, label, size, 700) + size * 1.0;
    const h = size * 1.75;
    roundRect(ctx, x, y - h * 0.72, w, h, 6);
    ctx.fillStyle = ink ? 'rgba(10,12,18,0.12)' : 'rgba(255,255,255,0.12)';
    ctx.fill();
    text(ctx, label, x + w / 2, y, { size, weight: 700, color: ink ? COL.ink : COL.text, align: 'center' });
    return w;
}

/* ---- canvas-backed planes ---------------------------------------------------------------------- */

/** A plane in D units whose picture is drawn with the 2D canvas API. Origin top-left. */
export class Label {
    constructor(stage, w, h, { order = 2, clip = null } = {}) {
        this.stage = stage;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.tex = new THREE.CanvasTexture(this.canvas);
        this.tex.colorSpace = THREE.SRGBColorSpace;
        this.tex.anisotropy = stage.maxAniso;
        this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false });
        if (clip) this.mat.clippingPlanes = clip;
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
        this.mesh.renderOrder = order;
        this.key = null;
        this.size(w, h);
    }
    size(w, h) {
        if (w === this.w && h === this.h && this.scale === this.stage.texScale) return;
        this.w = w; this.h = h; this.scale = this.stage.texScale;
        this.canvas.width = Math.max(2, Math.ceil(w * this.scale));
        this.canvas.height = Math.max(2, Math.ceil(h * this.scale));
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(w, h).translate(w / 2, -h / 2, 0);
        this.tex.dispose();
        this.tex = new THREE.CanvasTexture(this.canvas);
        this.tex.colorSpace = THREE.SRGBColorSpace;
        this.tex.anisotropy = this.stage.maxAniso;
        this.mat.map = this.tex;
        this.mat.needsUpdate = true;
        this.key = null;
    }
    /** Redraws only when `key` differs from the last draw. */
    draw(key, fn) {
        if (this.scale !== this.stage.texScale) this.size(this.w, this.h);
        if (key === this.key) return;
        this.key = key;
        const c = this.ctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
        c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        fn(c, this.w, this.h);
        this.tex.needsUpdate = true;
        wake();
    }
    dispose() { this.tex.dispose(); this.mat.dispose(); this.mesh.geometry.dispose(); }
}

/* ---- geometry ---------------------------------------------------------------------------------- */

function rrPath(p, x, y, w, h, r) {
    // top-left (x, y) with y up; the rect spans y .. y - h
    r = Math.max(0.01, Math.min(r, w / 2, h / 2));
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y);
    p.absarc(x + w - r, y - r, r, Math.PI / 2, 0, true);
    p.lineTo(x + w, y - h + r);
    p.absarc(x + w - r, y - h + r, r, 0, -Math.PI / 2, true);
    p.lineTo(x + r, y - h);
    p.absarc(x + r, y - h + r, r, -Math.PI / 2, -Math.PI, true);
    p.lineTo(x, y - r);
    p.absarc(x + r, y - r, r, Math.PI, Math.PI / 2, true);
    return p;
}

const geoCache = new Map();

/** A rounded glass block: its front face at z = 0, origin top-left, a bevel that catches the light. */
export function slabGeometry(w, h, r = 12, depth = 10, bevel = 3) {
    const key = `slab ${w.toFixed(1)} ${h.toFixed(1)} ${r} ${depth} ${bevel}`;
    let g = geoCache.get(key);
    if (g) return g;
    const b = Math.min(bevel, w / 4, h / 4);
    const shape = rrPath(new THREE.Shape(), b, -b, w - 2 * b, h - 2 * b, Math.max(0.5, r - b));
    g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 7 });
    g.translate(0, 0, -(depth + b));
    geoCache.set(key, g);
    return g;
}

/** A flat rounded rectangle (rows, fills), origin top-left. */
export function rectGeometry(w, h, r = 8) {
    const key = `rect ${w.toFixed(1)} ${h.toFixed(1)} ${r}`;
    let g = geoCache.get(key);
    if (g) return g;
    g = new THREE.ShapeGeometry(rrPath(new THREE.Shape(), 0, 0, w, h, r), 6);
    geoCache.set(key, g);
    return g;
}

/** A rounded outline `t` thick, `gap` outside a w x h box at origin top-left. */
export function ringGeometry(w, h, r, gap = 4, t = 3) {
    const key = `ring ${w.toFixed(1)} ${h.toFixed(1)} ${r} ${gap} ${t}`;
    let g = geoCache.get(key);
    if (g) return g;
    const o = gap + t;
    const shape = rrPath(new THREE.Shape(), -o, o, w + 2 * o, h + 2 * o, r + o);
    shape.holes.push(rrPath(new THREE.Path(), -gap, gap, w + 2 * gap, h + 2 * gap, r + gap));
    g = new THREE.ShapeGeometry(shape, 6);
    geoCache.set(key, g);
    return g;
}

/* ---- materials --------------------------------------------------------------------------------- */

const DARK = new THREE.Color('#0a0c12');
export const FILL = new THREE.Color(COL.accent);      // the "this one" fill (was whip's white #ededed)
export const NEUTRAL = new THREE.Color('#ededed');     // the tint of a faint fill

/** whip's surface as a block of smoked glass; `fill` 0..1 turns it into the yellow "this one". */
export function glassMaterial(opacity = 0.8, clip = null, dark = DARK) {
    const m = new THREE.MeshPhysicalMaterial({
        color: dark.clone(), roughness: 0.32, metalness: 0.0,
        clearcoat: 1.0, clearcoatRoughness: 0.14,
        transparent: true, opacity, envMapIntensity: 1.0,
        emissive: 0x000000,
    });
    m.userData.base = opacity;
    m.userData.dark = dark;
    if (clip) m.clippingPlanes = clip;
    return m;
}

export function setFill(m, f, tint = FILL) {
    m.color.copy(m.userData.dark || DARK).lerp(tint, f);
    // Lit from within as well: the fill reads as the accent, not the muddy shade a lit block turns.
    m.emissive.copy(tint).multiplyScalar(0.62 * f);
    m.opacity = m.userData.base + (0.97 - m.userData.base) * f;
    m.roughness = 0.32 - 0.12 * f;
}

export function basicMaterial(color, opacity = 1, clip = null) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false });
    if (clip) m.clippingPlanes = clip;
    return m;
}

/* ---- the soft shadow under every block ---------------------------------------------------------- */

let shadowTex = null;
function shadowTexture() {
    if (shadowTex) return shadowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.filter = 'blur(22px)';
    x.fillStyle = 'rgba(0,0,0,1)';
    roundRect(x, 56, 56, 144, 144, 18);
    x.fill();
    shadowTex = new THREE.CanvasTexture(c);
    return shadowTex;
}

/** A blurred dark plane behind a w x h block; `lift` 0..1 spreads and darkens it. */
export class Shadow {
    constructor(w, h, opacity = 0.55, order = 0, clip = null) {
        this.mat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity, depthWrite: false, toneMapped: false });
        if (clip) this.mat.clippingPlanes = clip;
        this.base = opacity;
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
        this.mesh.renderOrder = order;
        this.size(w, h);
    }
    size(w, h) {
        this.w = w; this.h = h;
        // the texture's box fills 144/256 of it
        const k = 256 / 144;
        this.mesh.scale.set(w * k * 1.04, h * k * 1.08, 1);
        this.mesh.position.set(w / 2, -h / 2 - 10, -14);
    }
    lift(f) {
        this.mat.opacity = this.base * (0.85 + 0.6 * f);
        this.mesh.position.y = -this.h / 2 - 10 - 16 * f;
        const k = 256 / 144;
        this.mesh.scale.set(this.w * k * (1.04 + 0.05 * f), this.h * k * (1.08 + 0.06 * f), 1);
    }
}

/* ---- the badge disc ------------------------------------------------------------------------------ */
/* whip's 3D-prompt disc, now an actual coin: dark core, white ring, glyph on its face. */

const discTex = {};
function discTexture(kind) {
    if (discTex[kind]) return discTex[kind];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const filled = kind === 'check' || kind === 'backOn' || kind === 'crossOn';
    x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2);
    x.fillStyle = filled ? COL.accent : 'rgba(10,12,18,0.85)';
    x.fill();
    x.lineWidth = 9;
    x.strokeStyle = filled ? COL.accent : 'rgba(255,255,255,0.62)';
    x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = filled ? COL.ink : 'rgba(255,255,255,0.92)';
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.lineWidth = 11;
    x.beginPath();
    if (kind === 'open') { x.moveTo(54, 40); x.lineTo(78, 64); x.lineTo(54, 88); }
    if (kind === 'check') { x.moveTo(38, 67); x.lineTo(56, 84); x.lineTo(90, 47); }
    if (kind === 'back' || kind === 'backOn') { x.lineWidth = 10; x.moveTo(90, 64); x.lineTo(38, 64); x.moveTo(58, 44); x.lineTo(38, 64); x.lineTo(58, 84); }
    if (kind === 'cross' || kind === 'crossOn') { x.lineWidth = 10; x.moveTo(46, 46); x.lineTo(82, 82); x.moveTo(82, 46); x.lineTo(46, 82); }
    x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    discTex[kind] = t;
    return t;
}

const discGeo = (() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 48, 1).rotateX(Math.PI / 2);
    // The face (the top cap, now facing +z) maps its picture straight on, upright.
    const cap = g.groups[1], idx = g.index, pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = cap.start; i < cap.start + cap.count; i++) {
        const v = idx.getX(i);
        uv.setXY(v, pos.getX(v) * 0.5 + 0.5, pos.getY(v) * 0.5 + 0.5);
    }
    return g;
})();

/** A coin `d` wide. kind: 'empty' | 'open' | 'check' | 'back' | 'cross'. Origin at its centre. */
export class Disc {
    constructor(d, kind = 'empty', order = 3, clip = null) {
        this.side = new THREE.MeshPhysicalMaterial({ color: 0x15171d, roughness: 0.3, metalness: 0.6, clearcoat: 1 });
        this.face = new THREE.MeshBasicMaterial({ map: discTexture(kind), transparent: true, toneMapped: false });
        if (clip) { this.side.clippingPlanes = clip; this.face.clippingPlanes = clip; }
        this.mesh = new THREE.Mesh(discGeo, [this.side, this.face, this.side]);
        this.mesh.renderOrder = order;
        this.mesh.scale.set(d / 2, d / 2, Math.max(4, d * 0.16));
        this.d = d;
        this.kind = kind;
    }
    set(kind) {
        if (kind === this.kind) return;
        this.kind = kind;
        this.face.map = discTexture(kind);
        wake();
    }
}

/* ---- paint swatches ------------------------------------------------------------------------------ */
/* Flat paint chips: a row's rounded swatch, a colour family's dot, the footer's white-ringed disc. */

const SW_MARGIN = 5;                             // room around the colour for the rings and the shadow
const METAL_DOT = [[0, '#f4f6f8'], [0.45, '#8d949c'], [0.6, '#e6e9ec'], [1, '#5d636a']];
const CHAMELEON_DOT = ['#1fa37a', '#2b6fd6', '#8a3fd1', '#d1306f', '#e0a21a', '#1fa37a'];

export class FlatSwatch {
    /** kind: 'row' (a rounded chip w x h), 'dot' (a family's disc, w across), 'chip' (the footer's ringed disc) */
    constructor(kind, w, h, order = 4, clip = null) {
        this.kind = kind; this.w = w; this.h = h;
        const W = w + 2 * SW_MARGIN, H = h + 2 * SW_MARGIN, k = 3;
        this.canvas = document.createElement('canvas');
        this.canvas.width = Math.ceil(W * k); this.canvas.height = Math.ceil(H * k);
        this.ctx = this.canvas.getContext('2d');
        this.ctx.setTransform(k, 0, 0, k, 0, 0);
        this.tex = new THREE.CanvasTexture(this.canvas);
        this.tex.colorSpace = THREE.SRGBColorSpace;
        this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false });
        if (clip) this.mat.clippingPlanes = clip;
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.mat);
        this.mesh.renderOrder = order;
    }
    zoom(k) { this.mesh.scale.setScalar(k); }
    /** p: a paint row { hex, hex2, family } (null: empty); selected: the row is the white "this one" */
    paint(p, selected = false) {
        const key = p ? `${p.hex}|${p.hex2 || ''}|${p.family}|${selected}` : `none|${selected}`;
        if (key === this.k) return;
        this.k = key;
        const c = this.ctx, m = SW_MARGIN, w = this.w, h = this.h, cx = m + w / 2, cy = m + h / 2, r = w / 2;
        c.clearRect(0, 0, w + 2 * m, h + 2 * m);
        const disc = (rad) => { c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); };
        // the fill: the paint, a colour-shift paint's two colours, or (family dots) the metal sheen and the chameleon wheel
        let fill = p ? p.hex : 'rgba(255,255,255,0.06)';
        if (p && this.kind === 'dot' && p.family === 'Metals') {
            fill = c.createLinearGradient(m, m, m + w, m + h);
            METAL_DOT.forEach(([o, col]) => fill.addColorStop(o, col));
        } else if (p && this.kind === 'dot' && p.family === 'Chameleon') {
            fill = c.createConicGradient((210 - 90) * Math.PI / 180, cx, cy);   // CSS "from 210deg" (0 at 12 o'clock)
            CHAMELEON_DOT.forEach((col, i) => fill.addColorStop(i / (CHAMELEON_DOT.length - 1), col));
        } else if (p && p.hex2) {
            fill = c.createLinearGradient(m, m, m + w, m + h);
            fill.addColorStop(0.15, p.hex); fill.addColorStop(0.85, p.hex2);
        }
        if (this.kind === 'row') {
            // a soft drop shadow, then a two-tone keyline: a light line outside and a dark one inside, so any paint
            // (black, white, or the same hue as what is behind it) keeps its edge on any background
            c.save();
            c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4; c.shadowOffsetY = 1.5;
            roundRect(c, m, m, w, h, 7); c.fillStyle = fill; c.fill();
            c.restore();
            roundRect(c, m - 1.2, m - 1.2, w + 2.4, h + 2.4, 8.2);
            c.lineWidth = 1.6; c.strokeStyle = selected ? 'rgba(10,12,18,0.35)' : 'rgba(255,255,255,0.55)'; c.stroke();
            c.save();
            roundRect(c, m, m, w, h, 7); c.clip();
            c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.stroke();
            c.restore();
        } else if (this.kind === 'dot') {
            // the same two-tone keyline: dark, then light, round the disc
            disc(r + 4.4); c.fillStyle = 'rgba(0,0,0,0.9)'; c.fill();
            disc(r + 2.7); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
            disc(r + 1.1); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fill();
            disc(r); c.fillStyle = fill; c.fill();
        } else {
            disc(r + 3.6); c.fillStyle = 'rgba(0,0,0,0.9)'; c.fill();
            disc(r); c.fillStyle = 'rgba(255,255,255,0.9)'; c.fill();
            disc(r - 4.8); c.fillStyle = '#0a0c12'; c.fill();
            disc(r - 4.8); c.fillStyle = fill; c.fill();
        }
        this.tex.needsUpdate = true;
        wake();
    }
}

/* ---- picking ------------------------------------------------------------------------------------ */
/* Meshes become clickable with hit(mesh, handlers). The nearest hit with a handler wins, so a key on a
   card beats the card. `clip(point)` can veto a hit (rows scrolled out of a list). */

const hitList = [];
export function hit(mesh, h) {
    mesh.userData.hit = h;
    if (!hitList.includes(mesh)) hitList.push(mesh);
    return mesh;
}
export function unhit(mesh) {
    const i = hitList.indexOf(mesh);
    if (i >= 0) hitList.splice(i, 1);
    delete mesh.userData.hit;
}

function shown(o) {
    for (let x = o; x; x = x.parent) if (!x.visible) return false;
    return true;
}

export class Pointer {
    constructor(stage) {
        this.stage = stage;
        this.ray = new THREE.Raycaster();
        this.ndc = new THREE.Vector2();
        this.hover = null;
        this.drag = null;
        this.down = null;
        this.x = 0; this.y = 0;
        this.blocked = false;
        const el = stage.canvas;
        el.addEventListener('pointermove', (e) => this.move(e));
        el.addEventListener('pointerdown', (e) => this.press(e));
        window.addEventListener('pointerup', (e) => this.release(e));
        el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
        el.addEventListener('pointerleave', () => this.setHover(null));
    }

    pick(e, want) {
        this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        this.ray.setFromCamera(this.ndc, this.stage.camera);
        const live = hitList.filter((m) => shown(m));
        const hits = this.ray.intersectObjects(live, false);
        // Dialogs draw over everything (a second pass), so they are hit first, then the nearest.
        const over = (h) => (h.object.userData.hit && h.object.userData.hit.over ? 1 : 0);
        hits.sort((a, b) => over(b) - over(a) || a.distance - b.distance);
        for (const h of hits) {
            const u = h.object.userData.hit;
            if (!u) continue;
            if (u.clip && !u.clip(h.point)) continue;
            if (want && !u[want]) {
                // A block that takes the pointer stops it here (a dialog over the rail).
                if (u.solid) return null;
                continue;
            }
            return { obj: h.object, u, point: h.point };
        }
        return null;
    }

    setHover(h) {
        const prev = this.hover;
        if (prev && (!h || prev.obj !== h.obj)) { if (prev.u.hover) prev.u.hover(false); }
        if (h && (!prev || prev.obj !== h.obj)) { if (h.u.hover) h.u.hover(true, h.point); }
        this.hover = h;
        if (h && h.u.hover && h.u.track) h.u.track(h.point);
        this.stage.canvas.style.cursor = h && (h.u.click || h.u.drag) ? 'pointer' : '';
    }

    move(e) {
        this.x = e.clientX; this.y = e.clientY;
        if (this.drag) { this.drag.u.drag.move(e, this.drag); return; }
        if (this.down && this.down.u.drag) {
            const d = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
            if (d > 6) {
                this.drag = this.down;
                this.down.u.drag.start(e, this.down);
                this.down.u.drag.move(e, this.down);
                return;
            }
        }
        this.setHover(this.pick(e, 'hover'));
    }

    press(e) {
        if (e.button !== 0) return;
        const h = this.pick(e, null);
        if (!h) { this.down = null; return; }
        // A drag-only surface (the rail, a list) under a click target: the drag belongs to it.
        const dragTarget = this.pick(e, 'drag');
        this.down = { x: e.clientX, y: e.clientY, obj: h.obj, u: h.u, point: h.point, dragU: dragTarget };
        if (h.u.press) h.u.press(true);
        // A slider grabs at once: no 6 px dead zone.
        if (h.u.drag && h.u.grab) { this.drag = this.down; h.u.drag.start(e, this.down); h.u.drag.move(e, this.down); }
        else if (!h.u.drag && dragTarget && dragTarget.u.drag && !dragTarget.u.grab) {
            this.down.u = Object.assign({}, h.u, { drag: dragTarget.u.drag });
            this.down.dragOnly = dragTarget;
        }
    }

    release(e) {
        const d = this.down;
        this.down = null;
        if (d && d.obj.userData.hit && d.obj.userData.hit.press) d.obj.userData.hit.press(false);
        if (this.drag) {
            const dr = this.drag;
            this.drag = null;
            if (dr.u.drag.end) dr.u.drag.end(e, dr);
            return;
        }
        if (!d || e.button !== 0) return;
        const h = this.pick(e, 'click');
        if (h && h.obj === d.obj && h.u.click) h.u.click(h.point);
    }

    wheel(e) {
        const h = this.pick(e, 'wheel');
        if (h) { e.preventDefault(); h.u.wheel(e.deltaY || e.deltaX, h.point); }
    }
}
