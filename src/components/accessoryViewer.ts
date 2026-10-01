import { BoxGeometry, Mesh, PointLight, ThreeViewer, type IObject3D } from 'threepipe';
import { AnisotropyPlugin } from '@threepipe/webgi-plugins';
import { createTrayMetalMaterial, makeStudioEnv } from './trayViewer';

export function createAccessoryViewer(canvas: HTMLCanvasElement) {
  const viewer = new ThreeViewer({ canvas, msaa: true, renderScale: Math.min(window.devicePixelRatio || 1, 2), rgbm: false, tonemap: true, plugins: [AnisotropyPlugin] });
  const scene = viewer.scene;
  scene.background = null; scene.backgroundColor = null;
  scene.environment = makeStudioEnv(); scene.environmentIntensity = 1.8;
  scene.environmentRotation.set(1.1, .35, 0);
  const camera = scene.mainCamera;
  camera.controlsMode = ''; camera.autoNearFar = false;
  camera.fov = 2; camera.near = 10; camera.far = 3000;
  const distance = 44 / 2 / Math.tan(1 * Math.PI / 180);
  const elevation = 24 * Math.PI / 180;
  camera.position.set(0, -distance * Math.cos(elevation), distance * Math.sin(elevation));
  camera.target.set(0, 0, 2); camera.setDirty();
  const metal = createTrayMetalMaterial();
  const anisotropy = viewer.getPlugin(AnisotropyPlugin);
  anisotropy?.enableAnisotropy(metal, undefined, .9, .2, 'ROTATION');
  const add = (width: number, depth: number, height: number, y: number, z: number) => {
    const mesh = new Mesh(new BoxGeometry(width, depth, height), metal);
    mesh.position.set(0, y, z);
    anisotropy?.tryComputeTangents(mesh as unknown as IObject3D, [metal]);
    scene.addObject(mesh as unknown as IObject3D, { autoCenter: false, autoScale: false, addToRoot: true });
  };
  // Straight sheet, crisp thin edge, one small front fold. Both sides stay open.
  add(282, 44, .9, 0, 0);
  add(282, .9, 4, -21.5, 1.55);
  const light = new PointLight(0xffffff, 2.2, 0, 1.4);
  light.position.set(-40, -20, 60);
  scene.addObject(light as unknown as IObject3D, { autoCenter: false, autoScale: false, addToRoot: true });
  const hover = (x: number, y: number) => {
    x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
    light.position.set(-40 + x * 90, -20 + y * 25, 60);
    scene.environmentRotation.set(1.1 + y * .12, .35 + x * .3, 0);
    scene.setDirty();
  };
  return { viewer, hover };
}
