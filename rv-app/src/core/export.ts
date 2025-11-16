import { exportPack, importPack } from './storage.js';

export async function savePack(passphrase?: string) {
  const blob = await exportPack(passphrase);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rv-pack.rvzip';
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadPack(file: File, passphrase?: string) {
  await importPack(file, passphrase);
}
