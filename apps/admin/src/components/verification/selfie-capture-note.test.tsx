import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SelfieCaptureNote, type SelfieCapture } from './selfie-capture-note';

const base: SelfieCapture = {
  source: 'app_camera',
  tokenVerified: true,
  liveness: 'passed',
  challenge: 'blink',
  fallbackReason: null,
  cardDetected: true,
  framesCaptured: 2,
  capturedAt: '2026-10-28T12:00:06.000Z',
  platform: 'ios',
  deviceModel: 'iPhone15,2',
};
afterEach(cleanup);

describe('SelfieCaptureNote (owner 2026-10-28)', () => {
  it('live camera, liveness passed, card found', () => {
    render(<SelfieCaptureNote capture={base} />);
    expect(screen.getByText('Снято живой камерой приложения')).toBeTruthy();
    expect(screen.getByText(/Живой человек: проверка пройдена \(моргнуть\)/)).toBeTruthy();
    expect(screen.getByText('Удостоверение в кадре найдено')).toBeTruthy();
    expect(screen.getByText(/Кадров снято: 2/)).toBeTruthy();
    expect(screen.getByText(/iPhone15,2, ios/)).toBeTruthy();
  });

  it('«Take photo anyway» and no card are flagged', () => {
    render(<SelfieCaptureNote capture={{ ...base, liveness: 'skipped', challenge: null, fallbackReason: 'timeout', cardDetected: false }} />);
    expect(screen.getByText(/не подтверждён/)).toBeTruthy();
    expect(screen.getByText(/автоматически не найдено/)).toBeTruthy();
  });

  it('no capture record (old selfie / switch off) warns', () => {
    render(<SelfieCaptureNote capture={null} />);
    expect(screen.getByText(/Нет отчёта камеры приложения/)).toBeTruthy();
  });
});
