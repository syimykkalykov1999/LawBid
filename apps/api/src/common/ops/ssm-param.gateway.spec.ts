import { SsmParamGateway } from './ssm-param.gateway';

const sent: { kind: string; input: Record<string, unknown> }[] = [];
let stored: Record<string, string> = {};

jest.mock(
  '@aws-sdk/client-ssm',
  () => ({
    SSMClient: class {
      send(cmd: { kind: string; input: { Name: string; Value?: string } }) {
        sent.push(cmd);
        if (cmd.kind === 'get') {
          if (!(cmd.input.Name in stored)) {
            const err = new Error('nope');
            err.name = 'ParameterNotFound';
            return Promise.reject(err);
          }
          return Promise.resolve({
            Parameter: { Value: ` ${stored[cmd.input.Name]} ` },
          });
        }
        stored[cmd.input.Name] = cmd.input.Value as string;
        return Promise.resolve({});
      }
    },
    GetParameterCommand: class {
      kind = 'get';
      constructor(public input: Record<string, unknown>) {}
    },
    PutParameterCommand: class {
      kind = 'put';
      constructor(public input: Record<string, unknown>) {}
    },
  }),
  { virtual: true },
);

const config = (env: Record<string, string>) => ({
  get: (k: string) => env[k],
});

describe('SsmParamGateway', () => {
  beforeEach(() => {
    sent.length = 0;
    stored = {};
  });

  it('says «not available» without parameter names (a Mac, CI)', async () => {
    const g = new SsmParamGateway(config({}) as never);
    expect(g.available).toBe(false);
    expect(g.modeParam('db')).toBeUndefined();
    expect(await g.getMode('db')).toBeNull();
    await expect(g.setMode('db', 'off')).rejects.toThrow('not on AWS');
    expect(sent).toHaveLength(0);
  });

  it('reads and writes the mode parameter, trimming the value', async () => {
    const g = new SsmParamGateway(
      config({
        OPS_DB_AUTOSCALE_MODE_PARAM: '/lawbid-prod/db-autoscale/mode',
        AWS_REGION: 'us-east-1',
      }) as never,
    );
    expect(g.available).toBe(true);
    stored['/lawbid-prod/db-autoscale/mode'] = 'dry-run';
    expect(await g.getMode('db')).toBe('dry-run');
    await g.setMode('db', 'on');
    expect(stored['/lawbid-prod/db-autoscale/mode']).toBe('on');
    expect(sent.at(-1)?.input).toMatchObject({
      Type: 'String',
      Overwrite: true,
    });
  });

  it('a missing parameter reads as null, an unknown value as null mode', async () => {
    const g = new SsmParamGateway(
      config({ OPS_REDIS_AUTOSCALE_MODE_PARAM: '/x/mode' }) as never,
    );
    expect(await g.getMode('redis')).toBeNull();
    stored['/x/mode'] = 'maybe';
    expect(await g.getMode('redis')).toBeNull();
  });
});
