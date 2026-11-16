import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoWants, AUTO_SCOPE, type AutoSignals } from './infra-auto.logic';
import { serverRemovedBy } from './infra-change.logic';
import * as switches from '../../../common/ops/infra-switches';
import * as registry from '../../../common/ops/cost-registry';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import {
  configSchema,
  validateConfigValue,
} from '../../admin-config/config-schema';
import { OWNER_ONLY_CONFIG_KEYS } from '../../admin-config/admin-config.service';

/**
 * Owner 15.11 («максимальное число серверов базы — настройка в админке,
 * чтобы "Авто" добавляло пятый, шестой и дальше»). Before: the primary + 3
 * extra servers were hard-coded (rows aws.db_shards.._3, Terraform 0..3).
 * Now `db.max_servers` (default 4 = as before, owner only with 2FA) decides
 * how far «Авто» goes, up to 16 servers in all.
 */
const calm: AutoSignals = {
  pressures: [],
  budgetRatio: null,
  searchEngine: null,
  partitionNeedsRunner: false,
};
const liveOf =
  (on: string[]) =>
  (id: string): 'on' | 'off' =>
    on.includes(id) ? 'on' : 'off';
const rowsUpTo = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    i === 0 ? 'aws.db_shards' : `aws.db_shards_${i + 1}`,
  );
const servers = (w: ReturnType<typeof autoWants>) =>
  w
    .filter((x) => x.id.startsWith('aws.db_shards'))
    .map((x) => `${x.id}:${x.to}`)
    .sort();

describe('db.max_servers: «Авто» adds the fifth, sixth … database server', () => {
  it('four servers, all full, default maximum (4): no fifth (as before)', () => {
    expect(
      servers(
        autoWants(
          { ...calm, serversFull: true },
          liveOf(rowsUpTo(3)),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });

  it('maximum 6: the fifth after the fourth, the sixth after the fifth, no seventh', () => {
    expect(
      servers(
        autoWants(
          { ...calm, serversFull: true, maxServers: 6 },
          liveOf(rowsUpTo(3)),
          new Set(),
        ),
      ),
    ).toEqual(['aws.db_shards_4:on']);
    expect(
      servers(
        autoWants(
          { ...calm, serversFull: true, maxServers: 6 },
          liveOf(rowsUpTo(4)),
          new Set(),
        ),
      ),
    ).toEqual(['aws.db_shards_5:on']);
    expect(
      servers(
        autoWants(
          { ...calm, serversFull: true, maxServers: 6 },
          liveOf(rowsUpTo(5)),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });

  it('maximum 16: up to the sixteenth server, never past the hard bound', () => {
    expect(
      servers(
        autoWants(
          { ...calm, serversFull: true, maxServers: 16 },
          liveOf(rowsUpTo(14)),
          new Set(),
        ),
      ),
    ).toEqual(['aws.db_shards_15:on']);
    expect(
      servers(
        autoWants(
          { ...calm, serversFull: true, maxServers: 99 },
          liveOf(rowsUpTo(15)),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });

  it('maximum 1 or 2: not even the second / third server by itself', () => {
    expect(
      servers(
        autoWants(
          { ...calm, shardGrowth: 'red', maxServers: 1 },
          liveOf([]),
          new Set(),
        ),
      ),
    ).toEqual([]);
    expect(
      servers(
        autoWants(
          { ...calm, serversFull: true, maxServers: 2 },
          liveOf(rowsUpTo(1)),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });

  it('Вкл on a row past the maximum is not switched on by itself', () => {
    expect(
      servers(
        autoWants(
          { ...calm, maxServers: 4, modes: { 'aws.db_shards_4': 'on' } },
          liveOf(rowsUpTo(3)),
          new Set(),
        ),
      ),
    ).toEqual([]);
    expect(
      servers(
        autoWants(
          { ...calm, maxServers: 5, modes: { 'aws.db_shards_4': 'on' } },
          liveOf(rowsUpTo(3)),
          new Set(),
        ),
      ),
    ).toEqual(['aws.db_shards_4:on']);
  });

  it('the highest empty server goes again, also past a lowered maximum', () => {
    expect(
      servers(
        autoWants(
          { ...calm, emptyServers: ['db6'], maxServers: 4 },
          liveOf(rowsUpTo(6)),
          new Set(),
        ),
      ),
    ).toEqual(['aws.db_shards_6:off']);
  });

  it('a switch-off of the N-th row removes server dbN; the plan scope covers every row', () => {
    expect(serverRemovedBy('aws.db_shards_4', 'off')).toBe('db4');
    expect(serverRemovedBy('aws.db_shards_15', 'off')).toBe('db15');
    expect(serverRemovedBy('aws.db_shards_15', 'on')).toBeNull();
    for (const id of rowsUpTo(15)) expect(AUTO_SCOPE[id]).toBeDefined();
  });
});

describe('db.max_servers: rows, switches, Terraform and the setting agree', () => {
  it('a switch and a registry row for every server up to the sixteenth', () => {
    expect(switches.DB_SERVERS_HARD_MAX).toBe(16);
    expect(switches.DB_SERVER_ROWS).toEqual(rowsUpTo(15));
    for (const [i, id] of rowsUpTo(15).entries()) {
      const sw = switches.switchFor(id);
      expect(sw?.values).toEqual({
        off: { db_shards: i },
        on: { db_shards: i + 1 },
      });
      expect(registry.COST_REGISTRY.some((e) => e.id === id)).toBe(true);
      expect(registry.INFRA_MODE_KEYS[id]).toBeDefined();
      expect(
        (APP_SETTINGS as Record<string, unknown>)[registry.INFRA_MODE_KEYS[id]],
      ).toBe('auto');
    }
    expect(switches.checkValue('db_shards', 15)).toBeNull();
    expect(switches.checkValue('db_shards', 16)).not.toBeNull();
    expect(registry.DB_SERVERS_HARD_MAX).toBe(switches.DB_SERVERS_HARD_MAX);
    expect(registry.DB_SERVERS_DEFAULT).toBe(switches.DB_SERVERS_DEFAULT);
  });

  it('the Terraform validation allows exactly the same 0..15', () => {
    const tf = readFileSync(
      join(__dirname, '../../../../../../infra/modules/stack/main.tf'),
      'utf8',
    );
    const m = /var\.db_shards >= 0 && var\.db_shards <= (\d+)/.exec(tf);
    expect(Number(m?.[1])).toBe(switches.DB_SERVERS_HARD_MAX - 1);
  });

  it('the tfvars schema the workflow checks allows 0..15', () => {
    const schema = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '../../../../../../infra/envs/prod/growth.auto.tfvars.schema.json',
        ),
        'utf8',
      ),
    ) as { properties: Record<string, { maximum?: number }> };
    expect(schema.properties.db_shards.maximum).toBe(15);
  });

  it('db.max_servers: default 4, 1..16, owner only (2FA)', () => {
    expect((APP_SETTINGS as Record<string, unknown>)['db.max_servers']).toBe(4);
    const s = configSchema()['db.max_servers'];
    expect(s).toBeDefined();
    expect(validateConfigValue(s, 4)).toBeNull();
    expect(validateConfigValue(s, 16)).toBeNull();
    expect(validateConfigValue(s, 17)).not.toBeNull();
    expect(validateConfigValue(s, 0)).not.toBeNull();
    expect(OWNER_ONLY_CONFIG_KEYS.has('db.max_servers')).toBe(true);
    expect(switches.maxDbServers(undefined)).toBe(4);
    expect(switches.maxDbServers('7')).toBe(7);
    expect(switches.maxDbServers(40)).toBe(16);
  });

  it('«Масштаб»: with the default only the three server rows of before', () => {
    const shown = (live: string | null, max?: number) =>
      rowsUpTo(15).filter((id) => switches.dbServerRowShown(id, live, max));
    expect(shown('off')).toEqual(rowsUpTo(3));
    expect(shown('off', 6)).toEqual(rowsUpTo(5));
    // A server above a lowered maximum stays visible while it runs.
    expect(switches.dbServerRowShown('aws.db_shards_6', 'on', 4)).toBe(true);
    expect(switches.dbServerRowShown('aws.rds_replicas', 'off', 1)).toBe(true);
  });
});
