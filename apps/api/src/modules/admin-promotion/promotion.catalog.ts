/**
 * Owner 2026-10-27 («Продвижение»): which app_config keys the admin page
 * edits. The plain-Russian texts live in the admin (apps/admin/src/lib/
 * promotion.ts); a test there reads this file so both lists stay equal.
 */

/** The SEO switches in the recommended order of turning them on
 * (docs/runbooks/SEO_STATIC_PAGES.md). `seo.generator_mode` belongs to the
 * page-generator job (another branch): it is shown only when the key exists
 * in APP_SETTINGS. */
export const SEO_SWITCH_KEYS = [
  'seo.incremental_enabled',
  'seo.sitemap_index_enabled',
  'seo.robots_ai_enabled',
  'seo.llms_enabled',
  'seo.quality_gate_enabled',
  'seo.ramp_per_day',
  'seo.generator_mode',
] as const;

/** Channel checklist items (plan §5), in the plan's order. */
export const CHECKLIST_IDS = [
  'google_search_console',
  'bing_webmaster',
  'google_business_profile',
  'apple_business_connect',
  'app_store_connect',
  'play_console',
  'lawyer_directories',
  'yelp_bbb',
  'reddit_quora',
  'video_social',
  'pr_reviews',
] as const;

export const checklistKey = (id: string): string => `seo.checklist.${id}`;

/**
 * What the static-page generator (scripts/seo) reads from GET
 * /public/seo-settings, by app_config key. A field is null while the admin
 * never decided (no stored row): the repository variable decides then.
 */
export const PUBLIC_SEO_FIELDS = {
  incremental: 'seo.incremental_enabled',
  sitemapIndex: 'seo.sitemap_index_enabled',
  robotsAi: 'seo.robots_ai_enabled',
  llms: 'seo.llms_enabled',
  qualityGate: 'seo.quality_gate_enabled',
  rampPerDay: 'seo.ramp_per_day',
} as const;

export type PublicSeoField = keyof typeof PUBLIC_SEO_FIELDS;

/** The only workflow file the page may start, and only as a dry run. */
export const SEO_WORKFLOW_FILE = 'seo-deploy.yml';
export const SEO_DRY_RUN_COMMAND = `gh workflow run ${SEO_WORKFLOW_FILE} -f dry_run=true`;
