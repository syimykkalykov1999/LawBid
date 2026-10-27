import { BadRequestException, HttpException } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  APP_SETTINGS,
  OWNER_SEO_PROMOTION_SETTINGS,
} from '../../common/app-settings/app-settings.defaults';
import type { AppConfigService } from '../feature-flags/services/app-config.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { configSchema } from '../admin-config/config-schema';
import {
  CHECKLIST_IDS,
  PUBLIC_SEO_FIELDS,
  SEO_SWITCH_KEYS,
  checklistKey,
} from './promotion.catalog';
import { PromotionService } from './promotion.service';

const admin = { id: 'a1', ip: '1.2.3.4' } as unknown as AdminActor;

function make(stored: Record<string, unknown> = {}, githubOn = false) {
  const settings = new AppSettingsService({
    getConfig: () => Promise.resolve(stored),
  } as unknown as AppConfigService);
  const config = { updateConfig: jest.fn().mockResolvedValue(undefined) };
  const manifest = {
    status: jest.fn().mockResolvedValue({
      manifestUrl: 'https://x/seo-manifest.json',
      manifest: null,
      error: 'нет',
      checkedAt: '2026-10-27T00:00:00.000Z',
    }),
  };
  const github = {
    configured: jest.fn().mockResolvedValue(githubOn),
    dispatchWorkflow: jest.fn().mockResolvedValue({ repo: 'o/r' }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new PromotionService(
    settings,
    config as never,
    manifest as never,
    github as never,
    audit as never,
  );
  return { svc, config, github, audit };
}

describe('promotion catalog', () => {
  it('every switch and checklist key is a real, validated setting', () => {
    const schema = configSchema();
    for (const k of SEO_SWITCH_KEYS) {
      // seo.generator_mode lands with the generator job (another branch).
      if (k === 'seo.generator_mode') continue;
      expect(schema[k]).toBeDefined();
    }
    for (const id of CHECKLIST_IDS) {
      expect(APP_SETTINGS).toHaveProperty([checklistKey(id)], false);
    }
    for (const k of Object.values(PUBLIC_SEO_FIELDS)) {
      expect(APP_SETTINGS).toHaveProperty([k]);
    }
  });

  it('the seo.* settings of this page are sorted by key (parallel PRs merge cleanly)', () => {
    const keys = Object.keys(OWNER_SEO_PROMOTION_SETTINGS);
    expect(keys.length).toBe(CHECKLIST_IDS.length + 6);
    expect(keys).toEqual([...keys].sort());
  });

  it('everything is off by default', () => {
    for (const id of CHECKLIST_IDS)
      expect(APP_SETTINGS[checklistKey(id) as keyof typeof APP_SETTINGS]).toBe(
        false,
      );
    expect(APP_SETTINGS['seo.sitemap_index_enabled']).toBe(false);
    expect(APP_SETTINGS['seo.ramp_per_day']).toBe(0);
  });
});

describe('PromotionService.publicSettings (what the generator reads)', () => {
  it('is null for every switch the admin never decided', async () => {
    expect(await make().svc.publicSettings()).toEqual({
      incremental: null,
      sitemapIndex: null,
      robotsAi: null,
      llms: null,
      qualityGate: null,
      rampPerDay: null,
    });
  });

  it('returns what is stored, including an explicit OFF and a zero', async () => {
    const r = await make({
      'seo.sitemap_index_enabled': true,
      'seo.llms_enabled': false,
      'seo.ramp_per_day': 0,
      'seo.robots_ai_enabled': 'yes',
    }).svc.publicSettings();
    expect(r).toMatchObject({
      sitemapIndex: true,
      llms: false,
      rampPerDay: 0,
      robotsAi: null,
    });
  });

  it('carries only the six switches: nothing personal, nothing else', async () => {
    const r = await make({
      'seo.checklist.pr_reviews': true,
    }).svc.publicSettings();
    expect(Object.keys(r).sort()).toEqual([
      'incremental',
      'llms',
      'qualityGate',
      'rampPerDay',
      'robotsAi',
      'sitemapIndex',
    ]);
  });
});

describe('PromotionService.overview / update', () => {
  it('lists the switches (stored or not) and the checklist with ticks', async () => {
    const { svc } = make({
      'seo.incremental_enabled': true,
      'seo.checklist.google_search_console': true,
    });
    const o = await svc.overview();
    const inc = o.switches.find((s) => s.key === 'seo.incremental_enabled');
    expect(inc).toMatchObject({ value: true, stored: true, type: 'boolean' });
    const llms = o.switches.find((s) => s.key === 'seo.llms_enabled');
    expect(llms).toMatchObject({ value: false, stored: false });
    expect(o.switches.find((s) => s.key === 'seo.ramp_per_day')?.type).toBe(
      'integer',
    );
    expect(o.checklist).toHaveLength(CHECKLIST_IDS.length);
    expect(
      o.checklist.find((c) => c.id === 'google_search_console')?.done,
    ).toBe(true);
    expect(o.checklist.find((c) => c.id === 'bing_webmaster')?.done).toBe(
      false,
    );
    expect(o.dryRun.command).toBe(
      'gh workflow run seo-deploy.yml -f dry_run=true',
    );
    expect(o.status.error).toBe('нет');
  });

  it('writes only seo.* keys of this page, through the audited config path', async () => {
    const { svc, config } = make();
    await svc.update(admin, 'seo.llms_enabled', true);
    expect(config.updateConfig).toHaveBeenCalledWith(
      admin,
      'seo.llms_enabled',
      true,
    );
    await svc.update(admin, 'seo.checklist.yelp_bbb', true);
    expect(config.updateConfig).toHaveBeenCalledTimes(2);
    for (const key of [
      'seo.unknown',
      'infra.dry_run',
      'guest.browsing_enabled',
      'seo.checklist.nope',
    ]) {
      await expect(svc.update(admin, key, true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(config.updateConfig).toHaveBeenCalledTimes(2);
  });
});

describe('PromotionService.dryRun', () => {
  it('without the GitHub App only hands back the command', async () => {
    const { svc, github, audit } = make({}, false);
    const r = await svc.dryRun(admin);
    expect(r).toMatchObject({
      started: false,
      command: 'gh workflow run seo-deploy.yml -f dry_run=true',
      runsUrl: null,
    });
    expect(github.dispatchWorkflow).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('with the App starts seo-deploy.yml as a dry run only, audits it, and waits a minute', async () => {
    const { svc, github, audit } = make({}, true);
    const r = await svc.dryRun(admin, 1_000_000);
    expect(github.dispatchWorkflow).toHaveBeenCalledWith('seo-deploy.yml', {
      dry_run: 'true',
    });
    expect(r).toMatchObject({
      started: true,
      runsUrl: 'https://github.com/o/r/actions/workflows/seo-deploy.yml',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'promotion.seo_dry_run',
        adminId: 'a1',
      }),
    );
    await expect(svc.dryRun(admin, 1_000_000 + 30_000)).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(svc.dryRun(admin, 1_000_000 + 61_000)).resolves.toMatchObject({
      started: true,
    });
  });

  it('a GitHub failure is reported calmly and does not block the next try', async () => {
    const { svc, github } = make({}, true);
    github.dispatchWorkflow.mockRejectedValueOnce(new Error('HTTP 403'));
    const r = await svc.dryRun(admin, 5_000_000);
    expect(r.started).toBe(false);
    expect(r.message).toContain('вручную');
    await expect(svc.dryRun(admin, 5_000_001)).resolves.toMatchObject({
      started: true,
    });
  });
});
