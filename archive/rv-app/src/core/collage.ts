import { MnemonicSceneBrief } from './schema.js';

const STICKERS = ['assets/stickers/star.svg', 'assets/stickers/anchor.svg', 'assets/stickers/mascot.svg'];

export async function renderThumbnail(scene: MnemonicSceneBrief): Promise<string> {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(180, 120);
  } else {
    canvas = document.createElement('canvas');
  }
  canvas.width = 180;
  canvas.height = 120;
  const ctx =
    (canvas as HTMLCanvasElement).getContext?.('2d') ??
    (canvas as OffscreenCanvas).getContext?.('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#071b28';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = scene.colors[0] ?? '#0ff2c3';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = scene.colors[1] ?? '#ffd166';
  ctx.font = 'bold 18px system-ui';
  ctx.fillText(scene.anchor, 16, 36);
  ctx.fillStyle = scene.colors[2] ?? '#ff66c4';
  ctx.fillText(scene.mascot, 16, 66);
  ctx.fillStyle = '#f2f8ff';
  wrapText(ctx, scene.action, 16, 96, canvas.width - 32, 16);
  const svg = await fetch(STICKERS[Math.floor(Math.random() * STICKERS.length)]).then((res) => res.text());
  const img = document.createElement('img');
  img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
  await img.decode?.();
  ctx.drawImage(img, canvas.width - 90, 20, 70, 70);
  if ('convertToBlob' in canvas) {
    return URL.createObjectURL(await (canvas as any).convertToBlob({ type: 'image/webp' }));
  }
  return (canvas as HTMLCanvasElement).toDataURL('image/webp');
}

type SceneContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function wrapText(ctx: SceneContext, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const testLine = `${line}${word} `;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth) {
      ctx.fillText(line, x, y);
      line = `${word} `;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
