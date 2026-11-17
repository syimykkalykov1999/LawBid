// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_badge_status.dart';
import 'client_badge_subscription_dto.dart';
import 'price_discount_dto.dart';

part 'client_badge_state_dto.g.dart';

@JsonSerializable()
class ClientBadgeStateDto {
  const ClientBadgeStateDto({
    required this.status,
    required this.badgeActive,
    required this.priceCents,
    required this.discount,
    required this.currency,
    required this.documentsRequired,
    required this.canSubmit,
    required this.canSubscribe,
    required this.includedInPlan,
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

  /// Owner 2026-10-07: the strikethrough old price, or null.
  final PriceDiscountDto? discount;
  final String currency;

  /// Owner 16.11: the admin switch «Проверка документов клиента». false (default) = the client pays and gets the badge at once, no documents; true = documents → approval → payment.
  final bool documentsRequired;

  /// Documents can be sent (none / rejected / revoked); always false while documents are not required.
  final bool canSubmit;

  /// The checkout can start: approved and not paid, or — documents not required — any client not paid and not revoked.
  final bool canSubscribe;

  /// Owner 2026-10-05: the client's plan includes the badge — no separate payment; the badge shows once the documents are approved.
  final bool includedInPlan;
  final ClientBadgeSubscriptionDto? subscription;
  final String? submittedAt;
  final String? rejectReason;
  final String? revokeReason;

  Map<String, Object?> toJson() => _$ClientBadgeStateDtoToJson(this);
}
