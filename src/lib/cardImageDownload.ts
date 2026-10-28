// Shared by Electron's main process and the browser preview. Kardsplayer serves
// AVIF as binary/octet-stream, so determine the MIME type from the actual bytes.
export function validateCardImageUrl(value: string): string {
  const url = new URL(value);
  const catalogueImage = ['https://www.kardsplayer.com', 'https://www.kards.com'].includes(url.origin)
    && /^\/images\/card\/v\d+\/[\w-]+\/(thumb\/)?[\w.-]+\.(avif|png|webp)$/.test(url.pathname);
  const weatherImage = url.origin === 'https://kards-assets.kardsdecker.com'
    && /^\/CardImgs\/temporary_weathers\/(?:[\w.-]|%[\da-f]{2})+\.png$/i.test(url.pathname);
  if ((!catalogueImage && !weatherImage)
    || url.search || url.hash || url.username || url.password) throw new Error('卡图地址无效');
  return url.href;
}

export async function downloadCardImage(value: string, fetcher: typeof fetch = fetch): Promise<string> {
  const url = validateCardImageUrl(value);
  const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`卡图下载失败（${response.status}）`);
  if (Number(response.headers.get('content-length')) > 10 * 1024 * 1024) throw new Error('卡图文件过大');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('卡图文件大小无效');
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  let mime = '';
  if (bytes[0] === 0x89 && ascii(1, 8) === 'PNG\r\n\x1a\n') mime = 'image/png';
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') mime = 'image/webp';
  else if (ascii(4, 8) === 'ftyp') {
    const size = new DataView(bytes.buffer).getUint32(0);
    if (size >= 16 && size <= bytes.length) {
      for (let i = 8; i + 4 <= size; i += 4) if (['avif', 'avis'].includes(ascii(i, i + 4))) mime = 'image/avif';
    }
  }
  if (!mime) throw new Error('卡图响应不是有效图片');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += ascii(offset, offset + 8192);
  return `data:${mime};base64,${btoa(binary)}`;
}
