// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_badge_status.dart';
import 'client_badge_subscription_dto.dart';

part 'client_badge_state_dto.g.dart';

@JsonSerializable()
class ClientBadgeStateDto {
  const ClientBadgeStateDto({
    required this.status,
    required this.badgeActive,
    required this.priceCents,
    required this.currency,
    required this.canSubmit,
    required this.canSubscribe,
    this.subscription,
    this.submittedAt,
    this.rejectReason,
    this.revokeReason,
  });

  factory ClientBadgeStateDto.fromJson(Map<String, Object?> json) =>
      _$ClientBadgeStateDtoFromJson(json);

  /// none = never applied.
  final ClientBadgeStatus status;

  /// The gold badge is on now.
  final bool badgeActive;

  /// Per month, in cents.
  final int priceCents;
  final String currency;

  /// Documents can be sent (none / rejected / revoked).
  final bool canSubmit;

  /// Approved and not paid: the checkout can start.
  final bool canSubscribe;
  final ClientBadgeSubscriptionDto? subscription;
  final String? submittedAt;
  final String? rejectReason;
  final String? revokeReason;

  Map<String, Object?> toJson() => _$ClientBadgeStateDtoToJson(this);
}
