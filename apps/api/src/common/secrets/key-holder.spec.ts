import {
  captureKeyEnv,
  KEY_ENV_VARS,
  readKey,
  resetKeyHolder,
  scrubKeyEnv,
} from './key-holder';

describe('key holder (S3-3)', () => {
  afterEach(() => resetKeyHolder());

  it('keeps the keys after they are deleted from the environment', () => {
    const env: Record<string, string | undefined> = {
      MESSAGE_ENC_KEYS: 'm1:secret',
      JWT_KEYS: 'j1:secret',
      OTHER: 'x',
    };
    expect(captureKeyEnv(env)).toBe(2);
    const removed = scrubKeyEnv(env);
    expect(removed.sort()).toEqual(['JWT_KEYS', 'MESSAGE_ENC_KEYS']);
    expect(env).toEqual({ OTHER: 'x' });
    expect(readKey('MESSAGE_ENC_KEYS', () => undefined)).toBe('m1:secret');
    expect(readKey('JWT_KEYS', () => undefined)).toBe('j1:secret');
  });

  it('falls back to the config when nothing was captured (tests, CLI)', () => {
    expect(readKey('SECRETS_MASTER_KEYS', () => 'from-config')).toBe(
      'from-config',
    );
  });

  it('scrubs every key variable name', () => {
    const env: Record<string, string | undefined> = {};
    for (const n of KEY_ENV_VARS) env[n] = 'v';
    expect(scrubKeyEnv(env)).toHaveLength(KEY_ENV_VARS.length);
  });
});
