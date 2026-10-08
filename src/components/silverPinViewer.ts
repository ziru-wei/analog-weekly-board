import {
  CanvasTexture, CircleGeometry, Mesh, MeshBasicMaterial, PhysicalMaterial, PointLight,
  SphereGeometry, SRGBColorSpace, ThreeViewer, type IObject3D,
} from 'threepipe';
import { makeStudioEnv } from './trayViewer';
import { variation, type Point } from '../model';

export type SilverPinVisual = Point & { id: string };

function makeWornSilverTextures() {
  const width = 1024, height = 512;
  let seed = 27041;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    return canvas;
  });
  const contexts = canvases.map(canvas => canvas.getContext('2d')!);
  const images = contexts.map(context => context.createImageData(width, height));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cloud = Math.sin(x * .019 + Math.cos(y * .014) * 2) * Math.sin(y * .025 - x * .006);
    const grain = (random() - .5) * 16;
    const values = [205 + cloud * 23 + grain, 116 + cloud * 36 + grain, 128 + grain * .4];
    for (let i = 0; i < images.length; i++) {
      const offset = (y * width + x) * 4;
      images[i].data[offset] = images[i].data[offset + 1] = images[i].data[offset + 2] = values[i];
      images[i].data[offset + 3] = 255;
    }
  }
  contexts.forEach((context, i) => context.putImageData(images[i], 0, 0));
  // Scratches cross at different angles, unlike the tray's directional brushing.
  for (let i = 0; i < 380; i++) {
    const x = random() * width, y = random() * height;
    const angle = random() * Math.PI * 2, length = 12 + random() * 160;
    contexts.forEach((context, channel) => {
      context.strokeStyle = channel === 0 ? 'rgba(250,249,239,.24)' : 'rgba(210,210,210,.32)';
      context.lineWidth = .5 + random() * .65;
      context.beginPath(); context.moveTo(x, y);
      context.quadraticCurveTo(x + Math.cos(angle) * length * .45, y + Math.sin(angle) * length * .45 + 5, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    });
  }
  const textures = canvases.map(canvas => { const texture = new CanvasTexture(canvas); texture.anisotropy = 8; return texture; });
  textures[0].colorSpace = SRGBColorSpace;
  return { color: textures[0], roughness: textures[1], bump: textures[2] };
}

function makeContactShadow() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 7, 32, 32, 30);
  gradient.addColorStop(0, '#251d16b0'); gradient.addColorStop(.5, '#251d1655'); gradient.addColorStop(1, '#251d1600');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** One WebGL context for every silver pin, including the reusable supply and drag preview. */
export function createSilverPinViewer(canvas: HTMLCanvasElement) {
  const viewer = new ThreeViewer({ canvas, msaa: true, renderScale: 1.5, rgbm: false, tonemap: true });
  const scene = viewer.scene;
  scene.background = null; scene.backgroundColor = null;
  scene.environment = makeStudioEnv(); scene.environmentIntensity = 1.9;
  scene.environmentRotation.set(.3, .5, 0);
  const camera = scene.mainCamera;
  camera.controlsMode = ''; camera.autoNearFar = false;
  camera.fov = 6; camera.near = 10; camera.far = 20000;
  camera.position.set(800, 500, 500 / Math.tan(Math.PI / 60));
  camera.target.set(800, 500, 0); camera.setDirty();
  const worn = makeWornSilverTextures();
  const material = new PhysicalMaterial({
    color: 0xe2e0d5, metalness: 1, roughness: .48,
    map: worn.color, roughnessMap: worn.roughness, bumpMap: worn.bump, bumpScale: .06,
  });
  const geometry = new SphereGeometry(16.5, 48, 32);
  const shadowGeometry = new CircleGeometry(24, 32);
  const shadowMaterial = new MeshBasicMaterial({ map: makeContactShadow(), transparent: true, depthWrite: false, toneMapped: false });
  const light = new PointLight(0xffffff, 10, 0, 0);
  const add = (object: unknown) => scene.addObject(object as IObject3D, { autoCenter: false, autoScale: false, addToRoot: true });
  add(light);
  const pool: { head: Mesh; shadow: Mesh }[] = [];
  const update = (pins: SilverPinVisual[], center: Point) => {
    light.position.set(center.x - 160, 1000 - center.y + 120, 500);
    while (pool.length < pins.length) {
      const head = new Mesh(geometry, material), shadow = new Mesh(shadowGeometry, shadowMaterial);
      add(shadow); add(head); pool.push({ head, shadow });
    }
    pool.forEach(({ head, shadow }, index) => {
      const pin = pins[index]; head.visible = shadow.visible = !!pin;
      if (!pin) return;
      head.position.set(pin.x, 1000 - pin.y, 13.5);
      head.rotation.set(.4, variation(pin.id) * Math.PI * 2, .1);
      shadow.position.set(pin.x + 2, 1000 - pin.y - 2.5, 0);
    });
    scene.setDirty();
  };
  return { viewer, update };
}
