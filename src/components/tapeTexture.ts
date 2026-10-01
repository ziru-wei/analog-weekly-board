// Crossfade the supplied paper scan at its original orientation and a fixed grain scale.
// Additive compositing keeps overlap brightness constant instead of exposing tile edges.
let texture: Promise<string> | undefined;
export function tapeTexture() {
  return texture ??= new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const patch = document.createElement('canvas'); patch.width = 256; patch.height = 73;
      const ctx = patch.getContext('2d')!;
      ctx.drawImage(image, 0, 0, 256, 73);
      const pixels = ctx.getImageData(0, 0, 256, 73);
      for (let y = 0; y < 73; y++) for (let x = 0; x < 256; x++) {
        const horizontal = Math.min(1, (x + .5) / 32, (255.5 - x) / 32);
        const vertical = Math.min(1, (y + .5) / 9, (72.5 - y) / 9);
        pixels.data[(y * 256 + x) * 4 + 3] = Math.round(255 * horizontal * vertical);
      }
      ctx.putImageData(pixels, 0, 0);
      const tile = document.createElement('canvas'); tile.width = 224; tile.height = 64;
      const output = tile.getContext('2d')!; output.globalCompositeOperation = 'lighter';
      for (const x of [-224, 0]) for (const y of [-64, 0]) output.drawImage(patch, x, y);
      resolve(tile.toDataURL());
    };
    image.onerror = reject; image.src = '/blue-tape-paper.png';
  });
}
