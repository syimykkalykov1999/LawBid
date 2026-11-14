import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Lightbox, type LightboxImage } from './lightbox';

afterEach(() => cleanup());

const IMAGES: LightboxImage[] = [
  { src: 'https://x/a.jpg', alt: 'Удостоверение' },
  { src: 'https://x/b.jpg', alt: 'Селфи' },
  { src: 'https://x/c.pdf', alt: 'Лицензия', kind: 'pdf' },
];

function Harness() {
  const [i, setI] = useState(0);
  return <Lightbox images={IMAGES} index={i} onIndex={setI} onClose={() => {}} />;
}

const rotation = () => document.querySelector('[data-testid="lightbox"] img')?.getAttribute('data-rotate');

describe('Lightbox rotate (scout 13.11, row 96)', () => {
  it('«Повернуть» and R turn by 90°, Shift+R back; another picture starts upright', () => {
    render(<Harness />);
    expect(rotation()).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Повернуть на 90° (R)' }));
    expect(rotation()).toBe('90');
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
    expect(rotation()).toBe('180');
    fireEvent.keyDown(window, { key: 'R', code: 'KeyR', shiftKey: true });
    expect(rotation()).toBe('90');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('lightbox-title').textContent).toBe('Селфи');
    expect(rotation()).toBe('0');
  });

  it('a PDF has no rotate button', () => {
    function Pdf() {
      return <Lightbox images={IMAGES} index={2} onIndex={() => {}} onClose={() => {}} />;
    }
    render(<Pdf />);
    expect(screen.queryByRole('button', { name: 'Повернуть на 90° (R)' })).toBeNull();
  });
});
