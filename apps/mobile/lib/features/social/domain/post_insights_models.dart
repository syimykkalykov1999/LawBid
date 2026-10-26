import 'package:flutter/foundation.dart';

/// Owner 2026-10-18 (Instagram Insights): the numbers of one post, seen by
/// its author only (`GET /posts/:id/insights`).
@immutable
class InsightsCounts {
  const InsightsCounts({
    this.impressions = 0,
    this.reach = 0,
    this.views = 0,
    this.likes = 0,
    this.comments = 0,
    this.saves = 0,
    this.reposts = 0,
    this.shares = 0,
    this.profileVisits = 0,
  });

  /// Times the card was shown in a feed or a profile list.
  final int impressions;

  /// Unique accounts that saw it.
  final int reach;

  /// Video plays (reels and video posts).
  final int views;
  final int likes;
  final int comments;
  final int saves;
  final int reposts;
  final int shares;

  /// Profile opens made from this post.
  final int profileVisits;

  /// Likes, comments, saves, reposts and shares together.
  int get interactions => likes + comments + saves + reposts + shares;

  int of(InsightsMetric m) => switch (m) {
        InsightsMetric.impressions => impressions,
        InsightsMetric.reach => reach,
        InsightsMetric.views => views,
        InsightsMetric.interactions => interactions,
        InsightsMetric.profileVisits => profileVisits,
      };
}

/// What the chart shows.
enum InsightsMetric { impressions, reach, views, interactions, profileVisits }

@immutable
class InsightsDay {
  const InsightsDay({required this.date, required this.counts});

  /// The viewer's local day.
  final DateTime date;
  final InsightsCounts counts;
}

@immutable
class PostInsights {
  const PostInsights({
    required this.postId,
    required this.publishedAt,
    required this.totals,
    required this.reachFollowers,
    required this.reachNonFollowers,
    required this.days,
  });

  final String postId;
  final DateTime publishedAt;

  /// All time.
  final InsightsCounts totals;
  final int reachFollowers;
  final int reachNonFollowers;

  /// Oldest first: the last 30 days, or since the post was published.
  final List<InsightsDay> days;
}
