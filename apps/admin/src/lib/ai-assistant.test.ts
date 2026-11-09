import { describe, expect, it } from 'vitest';
import { taskLine } from './ai-assistant';

describe('«Задача для ИИ» task line', () => {
  it('says where the task is', () => {
    expect(taskLine({ state: 'open', pulls: [] }).text).toBe('В работе');
    expect(taskLine({ state: 'open', pulls: [{ url: 'u', state: 'open', merged: false }] }).tone).toBe('warning');
    expect(taskLine({ state: 'closed', pulls: [{ url: 'u', state: 'closed', merged: true }] }).text).toBe('Готово: PR влит');
    expect(taskLine({ state: 'closed', pulls: [] }).text).toBe('Закрыта без PR');
  });
});
