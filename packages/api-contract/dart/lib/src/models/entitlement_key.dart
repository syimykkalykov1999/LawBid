// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum EntitlementKey {
  @JsonValue('included_seats')
  includedSeats('included_seats'),
  @JsonValue('max_seats')
  maxSeats('max_seats'),
  @JsonValue('extra_seat_price_cents')
  extraSeatPriceCents('extra_seat_price_cents'),
  @JsonValue('bids_any_state')
  bidsAnyState('bids_any_state'),
  @JsonValue('max_active_bids')
  maxActiveBids('max_active_bids'),
  @JsonValue('priority_search')
  prioritySearch('priority_search'),
  @JsonValue('calls')
  calls('calls'),
  @JsonValue('video_calls')
  videoCalls('video_calls'),
  @JsonValue('document_templates')
  documentTemplates('document_templates'),
  @JsonValue('chat_translate')
  chatTranslate('chat_translate'),
  @JsonValue('translations_per_day')
  translationsPerDay('translations_per_day'),
  @JsonValue('video_posts')
  videoPosts('video_posts'),
  @JsonValue('posts_per_day')
  postsPerDay('posts_per_day'),
  @JsonValue('videos_per_day')
  videosPerDay('videos_per_day'),
  @JsonValue('case_promotion')
  casePromotion('case_promotion'),
  @JsonValue('platform_payments')
  platformPayments('platform_payments'),
  @JsonValue('trial_days')
  trialDays('trial_days'),
  @JsonValue('verified_badge')
  verifiedBadge('verified_badge'),
  @JsonValue('priority_feed')
  priorityFeed('priority_feed'),
  @JsonValue('max_active_cases')
  maxActiveCases('max_active_cases'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EntitlementKey(this.json);

  factory EntitlementKey.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<EntitlementKey> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
