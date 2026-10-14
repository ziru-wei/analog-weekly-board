/**
 * Card stock for website cards, each with the ink it is printed in. The first is the default.
 * White and blue are the original stocks; gray, sage and pink come from the photographed paper scheme.
 * One photographed grain (`/paper-grain.png`) lies over all of them, so `paper` is the colour as seen.
 */
export const CARD_STOCK = [
  { paper: '#ebe9e3', ink: '#3e3c37' }, // white
  { paper: '#c4cdd2', ink: '#36424c' }, // blue
  { paper: '#d4d5d1', ink: '#3b3c36' }, // gray
  { paper: '#cbd8cb', ink: '#37423a' }, // sage
  { paper: '#e5d2d4', ink: '#4f3c3f' }, // pink
] as const;
export const CARD_COLORS = CARD_STOCK.map(stock => stock.paper);
/** Newly pasted website cards start on gray stock; cards saved without a colour keep white. */
export const NEW_CARD_PAPER = '#d4d5d1';
// Colours saved by earlier versions of the palette, mapped to the nearest stock.
const LEGACY: Record<string, string> = Object.fromEntries(Object.entries({
  '#ebe9e3': ['#f1efe8', '#f3f2ec', '#faf9f4'],
  '#c4cdd2': ['#c3d1e1', '#c7dcea', '#c1c9ce', '#c9d1d6', '#cdd7dd'],
  '#d4d5d1': ['#2f3236', '#3a3d42', '#26282b', '#2d2f33'],
  '#cbd8cb': ['#d3dbc8', '#dde6d4', '#d6dfcd', '#e2e6dd', '#efe3bf', '#f8edcb', '#f0e6c5', '#f6eed7', '#e2dcc8'],
  '#e5d2d4': ['#ead5cc', '#eadad0', '#f2dfd5'],
}).flatMap(([now, before]) => before.map(old => [old, now])));
export function cardStock(paper?: string) {
  const colour = paper && LEGACY[paper] || paper;
  const stock = CARD_STOCK.find(s => s.paper === colour) ?? CARD_STOCK[0];
  return { paper: stock.paper, ink: stock.ink };
}
