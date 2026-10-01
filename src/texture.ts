// Seeded, multiscale cork algorithm from the supplied 1.html, tuned to the warm reference.
  const BASE = [165, 108, 70];
  const SEED = 91423;

  function mulberry32(seed: number) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rand: () => number) {
    let u = 0;
    let v = 0;

    while (u === 0) u = rand();
    while (v === 0) v = rand();

    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function smoothField(width: number, height: number, cellSize: number, rand: () => number) {
    const gridWidth = Math.ceil(width / cellSize) + 2;
    const gridHeight = Math.ceil(height / cellSize) + 2;

    const grid = new Float32Array(gridWidth * gridHeight);
    const output = new Float32Array(width * height);

    for (let i = 0; i < grid.length; i++) {
      grid[i] = gaussian(rand);
    }

    const fade = (t: number) => t * t * (3 - 2 * t);

    for (let y = 0; y < height; y++) {
      const fy = y / cellSize;
      const y0 = Math.floor(fy);
      const ty = fade(fy - y0);

      for (let x = 0; x < width; x++) {
        const fx = x / cellSize;
        const x0 = Math.floor(fx);
        const tx = fade(fx - x0);

        const i00 = y0 * gridWidth + x0;
        const i10 = i00 + 1;
        const i01 = i00 + gridWidth;
        const i11 = i01 + 1;

        const top = grid[i00] * (1 - tx) + grid[i10] * tx;
        const bottom = grid[i01] * (1 - tx) + grid[i11] * tx;

        output[y * width + x] = top * (1 - ty) + bottom * ty;
      }
    }

    return output;
  }

export function renderCork(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.round(1600 * dpr), height = Math.round(1000 * dpr);
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const rand = mulberry32(SEED);

    const field2 = smoothField(width, height, 2.2 * dpr, rand);
    const field5 = smoothField(width, height, 5.0 * dpr, rand);
    const field13 = smoothField(width, height, 13.0 * dpr, rand);
    const field34 = smoothField(width, height, 34.0 * dpr, rand);

    const image = ctx.createImageData(width, height);
    const data = image.data;

    for (let y = 0; y < height; y++) {
      const seamX = Math.round((800 + Math.sin(y / dpr * .021) * .4) * dpr);
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const d = (x - seamX) / dpr;
        const right = d >= 0;
        const j = right ? ((y + Math.round(37 * dpr)) % height) * width + ((x + Math.round(113 * dpr)) % width) : i;

        const fine = gaussian(rand) * 6.8;
        const structure = field2[j] * 3.6 + field5[j] * 2.6 + field13[j] * 1.6 + field34[j] * 0.8;
        const pore = rand() < 0.038 ? -(4 + rand() * 11) : 0;
        let common = fine + structure + pore + (right ? 1 : -1);

        if (d >= -0.5 && d < 0.5) common -= 24;
        else if (d >= 0.5 && d < 1.5) common += 5;
        else if (d >= 1.5) common -= 5 * Math.exp(-(d - 1.5) / 2.5);
        else common -= 5 * Math.exp(-(-d - 0.5) / 2.5);

        const r = BASE[0] + common + gaussian(rand) * 1.8;
        const g = BASE[1] + common + gaussian(rand) * 2.2;
        const b = BASE[2] + common + gaussian(rand) * 2.8;

        const offset = i * 4;
        data[offset] = Math.max(0, Math.min(255, r));
        data[offset + 1] = Math.max(0, Math.min(255, g));
        data[offset + 2] = Math.max(0, Math.min(255, b));
        data[offset + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
  }
