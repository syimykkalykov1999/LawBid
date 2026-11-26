import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THIRD_PASS_A O1 (26.11): BOTH process entry points install the outbound
 * agents before the Nest app is built. The worker never did, so pushes (the
 * `push` queue runs in the worker in prod) went out without FCM h2 and with
 * Node's 4 s keep-alive. The bootstrap of an entry point cannot be run in a
 * unit test (it connects to everything), so its source is read.
 */
describe('outbound agents on every entry point (O1)', () => {
  const entry = (file: string) =>
    readFileSync(join(__dirname, '..', '..', file), 'utf8');

  it.each([
    ['main.ts', 'NestFactory.create<'],
    ['worker.ts', 'NestFactory.createApplicationContext('],
  ])(
    '%s calls installOutboundAgents() in bootstrap before %s',
    (file, nest) => {
      const src = entry(file);
      const boot = src.indexOf('async function bootstrap(');
      const call = src.indexOf('installOutboundAgents();', boot);
      const app = src.indexOf(nest, boot);
      expect(boot).toBeGreaterThan(-1);
      expect(call).toBeGreaterThan(boot);
      expect(app).toBeGreaterThan(call);
    },
  );
});
