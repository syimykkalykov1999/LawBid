import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  LearnedRanker,
  RANKER_MODEL_SOURCE,
  type RankerFeed,
  type RankerModelSource,
} from './learned-ranker';
import { CASES_FEATURE_SPEC } from './cases-features';
import { s3ModelReader } from './post-ranker.service';
import { REELS_FEATURE_SPEC } from './reels-features';

/**
 * Owner 25.11 («умную ленту для всех лент»): the reels feed and the
 * attorneys' case feed get their own learned second stage, each with its
 * own admin switch (Выкл / Вкл / Авто), feature list, A/B key and model
 * (ml/feed-ranker/train.py --feed reels | cases). Same safety as the
 * posts ranker (LearnedRanker): sha256, feature list check, latency
 * budget, S3 down = the formula.
 */
export const REELS_RANKER_FEED: RankerFeed = {
  feed: 'reels',
  experimentKey: 'reel_ranker',
  settingsPrefix: 'reco.ranker.reels',
  spec: REELS_FEATURE_SPEC,
  modelKeyRe: /^ml\/feed-ranker\/reels\/[A-Za-z0-9._-]{1,64}\/model\.onnx$/,
};

export const CASES_RANKER_FEED: RankerFeed = {
  feed: 'cases',
  experimentKey: 'case_ranker',
  settingsPrefix: 'reco.ranker.cases',
  spec: CASES_FEATURE_SPEC,
  modelKeyRe: /^ml\/feed-ranker\/cases\/[A-Za-z0-9._-]{1,64}\/model\.onnx$/,
};

@Injectable()
export class ReelRankerService extends LearnedRanker {
  constructor(
    @Optional() settings?: AppSettingsService,
    @Optional() moduleRef?: ModuleRef,
    @Optional()
    @Inject(RANKER_MODEL_SOURCE)
    source?: RankerModelSource,
  ) {
    super(REELS_RANKER_FEED, settings, s3ModelReader(moduleRef), source);
  }
}

@Injectable()
export class CaseRankerService extends LearnedRanker {
  constructor(
    @Optional() settings?: AppSettingsService,
    @Optional() moduleRef?: ModuleRef,
    @Optional()
    @Inject(RANKER_MODEL_SOURCE)
    source?: RankerModelSource,
  ) {
    super(CASES_RANKER_FEED, settings, s3ModelReader(moduleRef), source);
  }
}
