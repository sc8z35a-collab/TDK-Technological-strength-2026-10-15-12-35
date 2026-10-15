// Make sure web fonts are ready before canvases draw text into textures.
const SAMPLE = '特許證第九八八四四號磁性セラミックスフェライト昭和七年印年月日売上高億円兆世界シェアTDKABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%.,:-–';
const FACES = [
  '700 40px "Shippori Mincho B1"',
  '600 40px "Shippori Mincho B1"',
  '500 40px "IBM Plex Sans JP"',
  '600 40px "IBM Plex Sans JP"',
  '500 40px "IBM Plex Mono"',
  '400 40px "IBM Plex Mono"',
];

export function loadFonts(timeout = 3500) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const all = Promise.all(FACES.map((f) => document.fonts.load(f, SAMPLE).catch(() => null)));
  return Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
}
