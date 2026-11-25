import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { Assignment } from '../../experiments/experiments.service';
import { S3StorageService } from '../../files/storage/s3-storage.service';
import {
  LearnedRanker,
  RANKER_MODEL_SOURCE,
  type RankerFeed,
  type RankerModelSource,
  type S3ModelReader,
  isModelArmOf,
  manifestProblemFor,
} from './learned-ranker';
import { RANKER_FEATURE_SPEC } from './ranker-features';

export {
  RANKER_MODEL_SOURCE,
  RANKER_MODEL_VARIANT,
  p95,
  type RankerManifest,
  type RankerMode,
  type RankerModelSource,
} from './learned-ranker';

/**
 * The posts feed's learned ranker (F2): Search «Для вас». Settings keep
 * their first names `reco.ranker.*` (no rename = no admin value lost);
 * the reels and cases feeds have their own (ReelRankerService
 * `reco.ranker.reels.*`, CaseRankerService `reco.ranker.cases.*`).
 */
export const RANKER_EXPERIMENT_KEY = 'post_ranker';

export const POSTS_RANKER_FEED: RankerFeed = {
  feed: 'posts',
  experimentKey: RANKER_EXPERIMENT_KEY,
  settingsPrefix: 'reco.ranker',
  spec: RANKER_FEATURE_SPEC,
  modelKeyRe: /^ml\/feed-ranker\/[A-Za-z0-9._-]{1,64}\/model\.onnx$/,
};

/** The documents bucket through the app's S3 storage (every feed's ranker). */
export function s3ModelReader(moduleRef?: ModuleRef): S3ModelReader {
  return (key) => {
    const s3 = moduleRef?.get(S3StorageService, { strict: false });
    if (!s3) return Promise.reject(new Error('no S3 storage in this process'));
    return s3.read(s3.awsBucket('documents'), key);
  };
}

/** Why a manifest cannot be the posts model (null = fine). */
export function manifestProblem(m: unknown): string | null {
  return manifestProblemFor(RANKER_FEATURE_SPEC, m);
}

@Injectable()
export class PostRankerService extends LearnedRanker {
  constructor(
    @Optional() settings?: AppSettingsService,
    @Optional() moduleRef?: ModuleRef,
    @Optional()
    @Inject(RANKER_MODEL_SOURCE)
    source?: RankerModelSource,
  ) {
    super(POSTS_RANKER_FEED, settings, s3ModelReader(moduleRef), source);
  }

  /** True for the arm of the posts test that the model ranks. */
  static isModelArm(a: Assignment | null | undefined): boolean {
    return isModelArmOf(RANKER_EXPERIMENT_KEY, a);
  }
}
