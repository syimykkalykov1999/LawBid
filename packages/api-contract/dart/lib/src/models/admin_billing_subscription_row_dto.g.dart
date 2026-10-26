// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_billing_subscription_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBillingSubscriptionRowDto _$AdminBillingSubscriptionRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminBillingSubscriptionRowDto(
  id: json['id'] as String,
  userId: json['userId'] as String,
  user: json['user'] == null
      ? null
      : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
  status: json['status'] as String,
  plan: AdminBillingSubscriptionRowDtoPlan.fromJson(json['plan'] as String),
  assistantSeats: (json['assistantSeats'] as num).toInt(),
  effectiveSeats: (json['effectiveSeats'] as num).toInt(),
  priceCents: (json['priceCents'] as num).toInt(),
  monthlyEquivalentCents: (json['monthlyEquivalentCents'] as num).toInt(),
  trialEndsAt: json['trialEndsAt'] == null
      ? null
      : DateTime.parse(json['trialEndsAt'] as String),
  currentPeriodEnd: json['currentPeriodEnd'] == null
      ? null
      : DateTime.parse(json['currentPeriodEnd'] as String),
  graceEndsAt: json['graceEndsAt'] == null
      ? null
      : DateTime.parse(json['graceEndsAt'] as String),
  cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
  stripeSubscriptionId: json['stripeSubscriptionId'] as String?,
  stripeCustomerId: json['stripeCustomerId'] as String?,
  isActive: json['isActive'] as bool,
  contractGrant: json['contractGrant'] == null
      ? null
      : ActiveGrantSummaryDto.fromJson(
          json['contractGrant'] as Map<String, dynamic>,
        ),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminBillingSubscriptionRowDtoToJson(
  AdminBillingSubscriptionRowDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'user': ?instance.user?.toJson(),
  'status': instance.status,
  'plan': instance.plan.toJson(),
  'assistantSeats': instance.assistantSeats,
  'effectiveSeats': instance.effectiveSeats,
  'priceCents': instance.priceCents,
  'monthlyEquivalentCents': instance.monthlyEquivalentCents,
  'trialEndsAt': ?instance.trialEndsAt?.toIso8601String(),
  'currentPeriodEnd': ?instance.currentPeriodEnd?.toIso8601String(),
  'graceEndsAt': ?instance.graceEndsAt?.toIso8601String(),
  'cancelAtPeriodEnd': instance.cancelAtPeriodEnd,
  'stripeSubscriptionId': ?instance.stripeSubscriptionId,
  'stripeCustomerId': ?instance.stripeCustomerId,
  'isActive': instance.isActive,
  'contractGrant': ?instance.contractGrant?.toJson(),
  'createdAt': instance.createdAt.toIso8601String(),
};
