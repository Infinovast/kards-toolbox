import jsQR from 'jsqr';

self.onmessage = async (event: MessageEvent<Blob>) => {
  let image: ImageBitmap | undefined;
  try {
    image = await createImageBitmap(event.data);
    if (image.width * image.height > 40_000_000) throw new Error('图片尺寸过大');
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法读取图片');
    // Read exported headers at native resolution before trying the whole image.
    const regions = [
      { x: image.width * 0.65, y: 0, width: image.width * 0.35, height: Math.min(image.height, Math.max(220, image.height * 0.25)) },
      { x: 0, y: 0, width: image.width, height: image.height },
    ];
    for (const region of regions) {
      const scale = Math.min(1, 2800 / Math.max(region.width, region.height));
      canvas.width = Math.max(1, Math.round(region.width * scale));
      canvas.height = Math.max(1, Math.round(region.height * scale));
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      if (result) { self.postMessage(result.data); return; }
    }
    self.postMessage(null);
  } catch { self.postMessage(null); }
  finally { image?.close(); }
};
