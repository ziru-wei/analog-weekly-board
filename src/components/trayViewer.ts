import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  EquirectangularReflectionMapping,
  Float32BufferAttribute,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  PhysicalMaterial,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  ThreeViewer,
  Vector2,
  type IObject3D,
} from 'threepipe';
import { AnisotropyPlugin } from '@threepipe/webgi-plugins';

export const TRAY_W = 96;
export const TRAY_H = 18;
/** Transparent margin around the sheet so nothing is clipped by the canvas. */
export const TRAY_PAD = 6;

const THICKNESS = 1.5;
const EDGE_RADIUS = 0.5;
const CURL_RADIUS = 6;
const CURL_ANGLE = (52 * Math.PI) / 180;
const PAINT_R = 4.1;
const PAINT_H = 2.3;
const PAINT_GAP = 13.5;

type Station = { x: number; z: number; nx: number; nz: number };

// Cross-section of the sheet along x: flat in the middle, both ends curling up.
function sheetProfile(): Station[] {
  const flatHalf = TRAY_W / 2 - CURL_RADIUS * Math.sin(CURL_ANGLE);
  const arc = 24;
  const left: Station[] = [];
  for (let i = 0; i < arc; i++) {
    const a = CURL_ANGLE * (1 - i / arc);
    left.push({ x: -flatHalf - CURL_RADIUS * Math.sin(a), z: CURL_RADIUS * (1 - Math.cos(a)), nx: Math.sin(a), nz: Math.cos(a) });
  }
  const mid: Station[] = [-flatHalf, -flatHalf / 2, 0, flatHalf / 2, flatHalf].map((x) => ({ x, z: 0, nx: 0, nz: 1 }));
  const right = left.map((p) => ({ x: -p.x, z: p.z, nx: -p.nx, nz: p.nz })).reverse();
  return [...left, ...mid, ...right];
}

// Rounded-rectangle loop (y, offset along the surface normal): the sheet's cross-section across its width.
function sectionLoop() {
  const hy = TRAY_H / 2, ht = THICKNESS / 2, r = EDGE_RADIUS, seg = 5;
  const pts: [number, number][] = [];
  const corner = (cy: number, cd: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cy + r * Math.cos(a), cd + r * Math.sin(a)]);
    }
  };
  corner(hy - r, ht - r, 0); // top, back edge
  corner(-hy + r, ht - r, Math.PI / 2); // top, front edge
  corner(-hy + r, -ht + r, Math.PI); // bottom, front edge
  corner(hy - r, -ht + r, Math.PI * 1.5); // bottom, back edge
  return pts;
}

// A thin stainless sheet with real thickness and softly rounded edges, swept along the curled profile.
function makeSheetGeometry() {
  const prof = sheetProfile();
  const loop = sectionLoop();
  const n = loop.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  prof.forEach((p) => {
    loop.forEach(([y, d]) => {
      pos.push(p.x + p.nx * d, y, p.z + p.nz * d);
      uv.push((p.x + TRAY_W / 2) / TRAY_W, (y + TRAY_H / 2) / TRAY_H);
    });
  });
  for (let i = 0; i < prof.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k, b = i * n + ((k + 1) % n), c = (i + 1) * n + k, d = (i + 1) * n + ((k + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  }
  // end caps
  for (const [i, flip] of [[0, false], [prof.length - 1, true]] as const) {
    const p = prof[i];
    const base = pos.length / 3;
    loop.forEach(([y, d]) => { pos.push(p.x + p.nx * d, y, p.z + p.nz * d); uv.push(0, 0); });
    for (let k = 1; k < n - 1; k++) idx.push(...(flip ? [base, base + k + 1, base + k] : [base, base + k, base + k + 1]));
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Horizontal brushed-steel grain, shared by roughness and bump so highlights break up along x.
function makeBrushedTexture() {
  const w = 2048, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const y = Math.random() * h;
    const x = Math.random() * w;
    const len = 120 + Math.random() * 900;
    const v = Math.random() < 0.5 ? 255 : 0;
    g.strokeStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.32})`;
    g.lineWidth = 0.5 + Math.random() * 1.1;
    for (const ox of [0, -w]) {
      g.beginPath();
      g.moveTo(x + ox, y);
      g.lineTo(x + ox + len, y + (Math.random() - 0.5) * 0.5);
      g.stroke();
    }
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(0.5, 0.2);
  tex.anisotropy = 8;
  return tex;
}

// Procedural studio environment: dark room with soft boxes, so the metal has something crisp to reflect.
export function makeStudioEnv() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#c4c7cd');
  bg.addColorStop(0.5, '#80838a');
  bg.addColorStop(1, '#26272a');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 512);
  const box = (x: number, y: number, w: number, h: number, a: number) => {
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, `rgba(255,255,255,${a * 0.55})`);
    g.filter = 'blur(4px)';
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  };
  box(120, 60, 260, 150, 1);
  box(560, 40, 300, 56, 0.95);
  box(820, 190, 70, 190, 0.6);
  box(30, 230, 90, 170, 0.8);
  box(430, 270, 160, 60, 0.7);
  const tex = new CanvasTexture(c);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// A dollop of wet paint: domed with a rolled meniscus and a slightly irregular outline.
function makePaintGeometry(seed: number) {
  const prof = [[0, 1], [0.38, 0.985], [0.62, 0.93], [0.82, 0.78], [0.93, 0.55], [0.985, 0.28], [1, 0.08], [1.01, 0]]
    .map(([r, z]) => new Vector2(r * PAINT_R, z * PAINT_H));
  const geo = new LatheGeometry(prof.reverse(), 64);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getY(i), y = p.getZ(i); // lathe axis is y
    const th = Math.atan2(y, x);
    const k = 1 + 0.035 * Math.sin(3 * th + seed) + 0.025 * Math.sin(5 * th + seed * 2.3) + 0.012 * Math.sin(9 * th + seed * 4.1);
    p.setXYZ(i, x * k, z * (1 + 0.06 * Math.sin(2 * th + seed * 1.7)), y * k);
  }
  geo.rotateX(Math.PI / 2); // lathe y axis -> world z (up toward the camera)
  geo.computeVertexNormals();
  return geo;
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 14, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,.75)');
  grad.addColorStop(0.5, 'rgba(0,0,0,.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

export function createTrayMetalMaterial() {
  const grain = makeBrushedTexture();
  return new PhysicalMaterial({
    color: 0xb4b8be,
    metalness: 1,
    roughness: 0.34,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 1.4,
  });
}

export function createTrayViewer(canvas: HTMLCanvasElement) {
  const viewer = new ThreeViewer({
    canvas,
    msaa: true,
    renderScale: Math.min(window.devicePixelRatio || 1, 2),
    rgbm: false,
    tonemap: true,
    plugins: [AnisotropyPlugin],
  });
  const scene = viewer.scene;
  scene.backgroundColor = null;
  scene.background = null;
  scene.environment = makeStudioEnv();
  scene.environmentIntensity = 1.35;

  // 1 world unit = 1 css px; near-orthographic camera, tilted just enough to show the sheet's edge.
  const cam = scene.mainCamera;
  cam.controlsMode = '';
  cam.autoNearFar = false;
  cam.fov = 6;
  cam.near = 10;
  cam.far = 3000;
  const dist = (TRAY_H + TRAY_PAD * 2) / 2 / Math.tan((cam.fov * Math.PI) / 360);
  const tilt = (13 * Math.PI) / 180;
  cam.position.set(0, -dist * Math.sin(tilt), dist * Math.cos(tilt));
  cam.target.set(0, 0, 0);
  cam.setDirty();

  const add = (o: unknown) => scene.addObject(o as IObject3D, { autoCenter: false, autoScale: false, addToRoot: true });

  const sheetMat = createTrayMetalMaterial();
  const sheet = new Mesh(makeSheetGeometry(), sheetMat);
  const aniso = viewer.getPlugin(AnisotropyPlugin);
  aniso?.enableAnisotropy(sheetMat, undefined, 0.9, 0.2, 'ROTATION');
  aniso?.tryComputeTangents(sheet as unknown as IObject3D, [sheetMat]);
  add(sheet);

  // Paint dollops resting on the sheet, each with a soft contact shadow.
  const shadowTex = makeShadowTexture();
  const paints: PhysicalMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * PAINT_GAP;
    const mat = new PhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.15 });
    paints.push(mat);
    const shadow = new Mesh(
      new CircleGeometry(PAINT_R * 1.6, 32),
      new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    shadow.position.set(x + 0.5, -0.9, THICKNESS / 2 + 0.05);
    add(shadow);
    const paint = new Mesh(makePaintGeometry(i * 1.9 + 0.7), mat);
    paint.position.set(x, 0, THICKNESS / 2 - 0.1);
    add(paint);
  }

  const light = new PointLight(0xffffff, 2.2, 0, 1.4);
  light.position.set(0, 0, 40);
  add(light);

  const setColors = (colors: string[]) => {
    paints.forEach((m, i) => { if (colors[i]) { m.color.set(colors[i]); m.emissive.set(colors[i]); m.emissiveIntensity = 0.55; } m.setDirty?.(); });
    scene.setDirty();
  };
  return { viewer, light, setColors };
}
