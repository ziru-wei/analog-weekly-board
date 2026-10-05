import {
  BufferGeometry,
  CanvasTexture,
  EquirectangularReflectionMapping,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PhysicalMaterial,
  PointLight,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ThreeViewer,
  type IObject3D,
} from 'threepipe';
import { AnisotropyPlugin } from '@threepipe/webgi-plugins';

export const TRAY_W = 96;
export const TRAY_H = 18;
/** Transparent margin around the sheet so nothing is clipped by the canvas. */
export const TRAY_PAD = 6;

const THICKNESS = .28;
const PAINT_R = 4.1;
const PAINT_H = 2.3;
const PAINT_GAP = 13.5;

type ProfileRing = { inset: number; z: number; radius: number };
const CORNER_STEPS = 12;
const EDGE_STEPS = 24;
const RING_VERTICES = 4 * (CORNER_STEPS + EDGE_STEPS);

// Rounded rectangular sections form the rolled lip, stamped ribs and square paint pads.
function makeRoundedProfileGeometry(width: number, height: number, rings: ProfileRing[], seed?: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const cornerSteps = CORNER_STEPS, count = RING_VERTICES;
  const vertex = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    uv.push((x + TRAY_W / 2) / TRAY_W, (y + TRAY_H / 2) / TRAY_H);
  };
  for (const { inset, z, radius } of rings) {
    const halfX = width / 2 - inset, halfY = height / 2 - inset;
    const r = Math.min(radius, halfX, halfY);
    const contourVertex = (x: number, y: number) => {
      const theta = Math.atan2(y, x);
      const wobble = seed === undefined ? 1 : 1 + .012 * Math.sin(7 * theta + seed) + .008 * Math.sin(11 * theta + seed * 2);
      vertex(x * wobble, y * wobble, z);
    };
    for (let corner = 0; corner < 4; corner++) {
      const cx = (corner === 0 || corner === 3 ? 1 : -1) * (halfX - r);
      const cy = (corner < 2 ? 1 : -1) * (halfY - r);
      for (let step = 0; step <= cornerSteps; step++) {
        const angle = (corner + step / cornerSteps) * Math.PI / 2;
        const x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle);
        contourVertex(x, y);
      }
      const endAngle = (corner + 1) * Math.PI / 2;
      const next = (corner + 1) % 4;
      const nextCx = (next === 0 || next === 3 ? 1 : -1) * (halfX - r);
      const nextCy = (next < 2 ? 1 : -1) * (halfY - r);
      for (let step = 1; step < EDGE_STEPS; step++) {
        const t = step / EDGE_STEPS;
        contourVertex(cx + (nextCx - cx) * t + r * Math.cos(endAngle), cy + (nextCy - cy) * t + r * Math.sin(endAngle));
      }
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < count; i++) {
    const a = ring * count + i, b = ring * count + (i + 1) % count;
    idx.push(a, b, a + count, b, b + count, a + count);
  }
  const center = pos.length / 3;
  vertex(0, 0, rings[rings.length - 1].z);
  const last = (rings.length - 1) * count;
  for (let i = 0; i < count; i++) idx.push(center, last + i, last + (i + 1) % count);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return geometry;
}

function makeTrayGeometry() {
  const smoothGeometry = makeRoundedProfileGeometry(TRAY_W, TRAY_H, [
    { inset: 0, z: -THICKNESS / 2, radius: 1.25 },
    { inset: 0, z: .72, radius: 1.25 },
    { inset: .12, z: .88, radius: 1.13 },
    { inset: .3, z: .71, radius: .95 },
    { inset: .31, z: .22, radius: .94 },
    { inset: .58, z: THICKNESS / 2, radius: .67 },
  ]);
  const position = smoothGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (z > .3) {
      // Subpixel forming irregularity changes reflection along the lip without a painted highlight.
      position.setZ(i, z + .035 * Math.sin(x * .34 + y * .8) + .014 * Math.sin(x * .77 - y * 1.3));
    }
  }
  // Independent face normals preserve the folded sheet's hard creases instead of rounding them off.
  const geometry = smoothGeometry.toNonIndexed();
  smoothGeometry.dispose();
  geometry.computeVertexNormals();
  const floorIndices = RING_VERTICES * 3;
  const rimIndices = geometry.attributes.position.count - floorIndices;
  geometry.addGroup(0, rimIndices, 0);
  geometry.addGroup(rimIndices, floorIndices, 1);
  return geometry;
}

function makeStampedRibGeometry(width: number, height: number) {
  return makeRoundedProfileGeometry(width, height, [
    { inset: 0, z: THICKNESS / 2, radius: .8 },
    { inset: .09, z: .22, radius: .71 },
    { inset: .23, z: .6, radius: .57 },
    { inset: .38, z: .73, radius: .42 },
    { inset: .62, z: .76, radius: .18 },
  ]);
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

// Fine directional wear and mottled steel, kept local to the palette's recessed pan.
function makePanTextures() {
  const w = 1536, h = 320;
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    return canvas;
  });
  const contexts = canvases.map(canvas => canvas.getContext('2d')!);
  const data = contexts.map(context => context.createImageData(w, h));
  let state = 74123;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let y = 0; y < h; y++) {
    const streak = (random() - .5) * 18;
    for (let x = 0; x < w; x++) {
      const grain = (random() - .5) * 24;
      const patina = 9 * Math.sin(x * .009 + Math.sin(y * .026)) + 6 * Math.sin(x * .023 - y * .013);
      const values = [174 + streak + grain + patina, 125 + grain * .6 + patina, 128 + streak * .25 + grain * .45];
      for (let i = 0; i < data.length; i++) {
        const offset = (y * w + x) * 4;
        data[i].data[offset] = data[i].data[offset + 1] = data[i].data[offset + 2] = values[i];
        data[i].data[offset + 3] = 255;
      }
    }
  }
  contexts.forEach((context, i) => context.putImageData(data[i], 0, 0));
  for (let i = 0; i < 650; i++) {
    const x = random() * w, y = random() * h, length = 12 + random() * 510;
    const tilt = (random() - .5) * 2.5;
    contexts.forEach((context, channel) => {
      context.lineWidth = .45 + random() * .55;
      context.strokeStyle = channel === 0 ? `rgba(240,239,231,${.06 + random() * .2})` : 'rgba(210,210,210,.16)';
      context.beginPath(); context.moveTo(x, y); context.lineTo(x + length, y + tilt); context.stroke();
    });
  }
  const textures = canvases.map(canvas => {
    const texture = new CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
  });
  textures[0].colorSpace = SRGBColorSpace;
  return { color: textures[0], roughness: textures[1], bump: textures[2] };
}

// Procedural studio environment: dark room with soft boxes, so the metal has something crisp to reflect.
export function makeStudioEnv(sharpReflections = false) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, sharpReflections ? '#92979f' : '#c4c7cd');
  bg.addColorStop(0.5, sharpReflections ? '#555b64' : '#80838a');
  bg.addColorStop(1, sharpReflections ? '#16191e' : '#26272a');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 512);
  const box = (x: number, y: number, w: number, h: number, a: number) => {
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, `rgba(255,255,255,${a * 0.55})`);
    g.filter = sharpReflections ? 'blur(3px)' : 'blur(4px)';
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  };
  box(120, 60, 260, 150, 1);
  box(560, 40, 300, 56, 0.95);
  box(820, 190, 70, 190, 0.6);
  box(30, 230, 90, 170, 0.8);
  box(430, 270, 160, 60, 0.7);
  if (sharpReflections) {
    // Narrow strip lights give adjacent folded faces distinct bright and dark reflections.
    box(180, 170, 50, 260, 1);
    box(620, 200, 22, 220, .95);
    box(670, 180, 160, 180, .3);
  }
  const tex = new CanvasTexture(c);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Broad square paint pads with softened, slightly uneven edges and a shallow crown.
function makePaintGeometry(seed: number) {
  return makeRoundedProfileGeometry(PAINT_R * 2, PAINT_R * 2, [
    { inset: 0, z: 0, radius: .55 },
    { inset: .03, z: PAINT_H * .24, radius: .58 },
    { inset: .15, z: PAINT_H * .66, radius: .65 },
    { inset: .45, z: PAINT_H * .9, radius: .7 },
    { inset: .85, z: PAINT_H, radius: .65 },
  ], seed);
}

function makePigmentTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = 170 + Math.random() * 85;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grain;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return new CanvasTexture(canvas);
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const pixels = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const distance = Math.pow(Math.pow(Math.abs(x - 63.5), 6) + Math.pow(Math.abs(y - 63.5), 6), 1 / 6) / 64;
    pixels.data[(y * 128 + x) * 4 + 3] = Math.round(150 * Math.pow(Math.max(0, 1 - distance), 1.8));
  }
  g.putImageData(pixels, 0, 0);
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
    // Supersample the small WebGL canvas so the thin metal lip stays crisp at normal DPR.
    renderScale: 2,
    rgbm: false,
    tonemap: true,
    plugins: [AnisotropyPlugin],
  });
  const scene = viewer.scene;
  scene.backgroundColor = null;
  scene.background = null;
  scene.environment = makeStudioEnv(true);
  scene.environmentIntensity = 1.4;

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
  sheetMat.color.set(0xd0d3d8);
  sheetMat.roughness = .17;
  sheetMat.bumpScale = .012;
  const pan = makePanTextures();
  const panMat = new PhysicalMaterial({
    color: 0xd4d6d9, metalness: 1, roughness: .36,
    map: pan.color, roughnessMap: pan.roughness, bumpMap: pan.bump, bumpScale: .09,
  });
  const sheet = new Mesh(makeTrayGeometry(), [sheetMat, panMat]);
  const aniso = viewer.getPlugin(AnisotropyPlugin);
  aniso?.enableAnisotropy(sheetMat, undefined, .15, .2, 'ROTATION');
  aniso?.enableAnisotropy(panMat, undefined, .78, .2, 'ROTATION');
  aniso?.tryComputeTangents(sheet as unknown as IObject3D, [sheetMat, panMat]);
  add(sheet);

  // Stampings share the well's material and continuous UVs; only the rolled rim is polished.
  const addStamping = (width: number, height: number, x: number, y: number) => {
    const geometry = makeStampedRibGeometry(width, height);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) + x / TRAY_W, uv.getY(i) + y / TRAY_H);
    }
    const rib = new Mesh(geometry, panMat);
    rib.position.set(x, y, 0);
    aniso?.tryComputeTangents(rib as unknown as IObject3D, [panMat]);
    add(rib);
  };
  for (const y of [-6, 6]) addStamping(78, 1.65, 0, y);
  for (const x of [-43, 43]) addStamping(1.65, 9, x, 0);

  // Square paint pads resting in the well, each with a matching soft contact shadow.
  const shadowTex = makeShadowTexture();
  const pigment = makePigmentTexture();
  const paints: PhysicalMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * PAINT_GAP;
    const mat = new PhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: .68, clearcoat: .12, clearcoatRoughness: .4,
      bumpMap: pigment, bumpScale: .14,
    });
    // Each pad maps the pigment grain across its own surface, independent of the tray UVs.
    const paintGeometry = makePaintGeometry(i * 1.9 + .7);
    const paintPosition = paintGeometry.attributes.position;
    const paintUv = paintGeometry.attributes.uv;
    for (let v = 0; v < paintUv.count; v++) {
      paintUv.setXY(v, paintPosition.getX(v) / (PAINT_R * 2) + .5, paintPosition.getY(v) / (PAINT_R * 2) + .5);
    }
    paints.push(mat);
    const shadow = new Mesh(
      new PlaneGeometry(PAINT_R * 3.2, PAINT_R * 3.2),
      new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    shadow.position.set(x + 0.5, -0.9, THICKNESS / 2 + 0.05);
    add(shadow);
    const paint = new Mesh(paintGeometry, mat);
    paint.position.set(x, 0, THICKNESS / 2 - 0.1);
    add(paint);
  }

  const light = new PointLight(0xffffff, 2.2, 0, 1.4);
  light.position.set(0, 0, 40);
  add(light);

  const setColors = (colors: string[]) => {
    paints.forEach((m, i) => { if (colors[i]) { m.color.set(colors[i]); m.emissive.set(colors[i]); m.emissiveIntensity = .3; } m.setDirty?.(); });
    scene.setDirty();
  };
  return { viewer, light, setColors };
}
