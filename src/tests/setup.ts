import '@testing-library/jest-dom/vitest';

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => {
    return {
      filter: 'none',
      fillRect: () => {},
      clearRect: () => {},
      getImageData: (_x: number, _y: number, w = 1, h = 1) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: (text: string) => ({
        width: (text || '').length * 8,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 4,
      }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
    };
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

