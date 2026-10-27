// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_review_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeReviewItemDto _$StripeReviewItemDtoFromJson(Map<String, dynamic> json) =>
    StripeReviewItemDto(
      id: json['id'] as String,
      kind: StripeReviewKind.fromJson(json['kind'] as String),
      status: StripeReviewItemDtoStatus.fromJson(json['status'] as String),
      stripeRef: json['stripeRef'] as String,
      casePaymentId: json['casePaymentId'] as String?,
      userId: json['userId'] as String?,
      amountCents: (json['amountCents'] as num?)?.toInt(),
      currency: json['currency'] as String,
      summary: json['summary'] as String,
      details: json['details'],
      openedAt: DateTime.parse(json['openedAt'] as String),
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
      sla: StripeReviewItemDtoSla.fromJson(json['sla'] as String),
      resolvedAt: json['resolvedAt'] == null
          ? null
          : DateTime.parse(json['resolvedAt'] as String),
      resolution: json['resolution'] as String?,
    );

Map<String, dynamic> _$StripeReviewItemDtoToJson(
  StripeReviewItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'status': instance.status.toJson(),
  'stripeRef': instance.stripeRef,
  'casePaymentId': ?instance.casePaymentId,
  'userId': ?instance.userId,
  'amountCents': ?instance.amountCents,
  'currency': instance.currency,
  'summary': instance.summary,
  'details': ?instance.details,
  'openedAt': instance.openedAt.toIso8601String(),
  'dueAt': ?instance.dueAt?.toIso8601String(),
  'sla': instance.sla.toJson(),
  'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
  'resolution': ?instance.resolution,
};
