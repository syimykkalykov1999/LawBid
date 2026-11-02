import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The publisher loads the Kinesis client by a computed name
 * (`import(pkg)`), so neither tsc nor the bundler notices a missing
 * dependency. Terraform sets EVENTS_STREAM_NAME when
 * growth.events_stream_enabled = true; without the package every publish
 * would then fail at run time (audit 2026-11-02).
 */
describe('event stream publisher dependency', () => {
  it('declares @aws-sdk/client-kinesis in package.json', () => {
    const src = readFileSync(
      join(__dirname, 'event-stream.publisher.ts'),
      'utf8',
    );
    const name = /const pkg = '([^']+)'/.exec(src)?.[1];
    expect(name).toBe('@aws-sdk/client-kinesis');
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../../package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies[name as string]).toBeDefined();
  });
});
