// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stripe_review_item_dto_sla.dart';
import 'stripe_review_item_dto_status.dart';
import 'stripe_review_kind.dart';

part 'stripe_review_item_dto.g.dart';

@JsonSerializable()
class StripeReviewItemDto {
  const StripeReviewItemDto({
    required this.id,
    required this.kind,
    required this.status,
    required this.stripeRef,
    required this.casePaymentId,
    required this.userId,
    required this.amountCents,
    required this.currency,
    required this.summary,
    required this.details,
    required this.openedAt,
    required this.dueAt,
    required this.sla,
    required this.resolvedAt,
    required this.resolution,
  });

  factory StripeReviewItemDto.fromJson(Map<String, Object?> json) =>
      _$StripeReviewItemDtoFromJson(json);

  final String id;
  final StripeReviewKind kind;
  final StripeReviewItemDtoStatus status;
  final String stripeRef;
  final String? casePaymentId;
  final String? userId;
  final int? amountCents;
  final String currency;
  final String summary;
  final dynamic details;
  final DateTime openedAt;

  /// Stripe's evidence deadline, or the SLA clock.
  final DateTime? dueAt;
  final StripeReviewItemDtoSla sla;
  final DateTime? resolvedAt;
  final String? resolution;

  Map<String, Object?> toJson() => _$StripeReviewItemDtoToJson(this);
}
