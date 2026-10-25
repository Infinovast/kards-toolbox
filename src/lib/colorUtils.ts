// Hex to HSL color conversion utilities
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToRgb(hex: string): string | null {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

export function generateLightModeColors(baseHex: string) {
  const { h, s, l } = hexToHsl(baseHex);

  const panelHex = hslToHex(h, s, Math.min(100, l + 6));
  const pbRgb = hexToRgb(panelHex) || '255, 255, 255';
  
  return {
    '--color-kards-bg': baseHex,
    '--color-kards-panel': panelHex,
    '--color-kards-panel-alt': hslToHex(h, s, Math.min(100, l + 2)),
    '--color-kards-panel-hover': hslToHex(h, s, Math.max(0, l - 4)),
    '--color-kards-input-bg': hslToHex(h, s, Math.min(100, l + 11)),
    '--color-kards-modal-bg': panelHex,
    '--color-kards-modal-overlay': `rgba(${hexToRgb(baseHex) || '220, 215, 201'}, 0.85)`,
    '--bg-pattern': `url("https://www.transparenttextures.com/patterns/cubes.png"), radial-gradient(circle at center, ${panelHex} 0%, ${baseHex} 100%)`,
    '--rgb-panel-overlay': pbRgb,
    '--rgb-panel-overlay-inv': '0, 0, 0'
  };
}
