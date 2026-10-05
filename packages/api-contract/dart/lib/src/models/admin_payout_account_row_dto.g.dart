// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payout_account_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPayoutAccountRowDto _$AdminPayoutAccountRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminPayoutAccountRowDto(
  userId: json['userId'] as String,
  user: json['user'] == null
      ? null
      : CasePaymentPartyDto.fromJson(json['user'] as Map<String, dynamic>),
  email: json['email'] as String?,
  stripeAccountId: json['stripeAccountId'] as String,
  status: PayoutAccountStatus.fromJson(json['status'] as String),
  chargesEnabled: json['chargesEnabled'] as bool,
  payoutsEnabled: json['payoutsEnabled'] as bool,
  requirementsDue: (json['requirementsDue'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  disabledReason: json['disabledReason'] as String?,
  receivedCents: (json['receivedCents'] as num).toInt(),
  processingFeePayer: json['processingFeePayer'] == null
      ? null
      : ProcessingFeePayer.fromJson(json['processingFeePayer'] as String),
  lastSyncedAt: json['lastSyncedAt'] == null
      ? null
      : DateTime.parse(json['lastSyncedAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminPayoutAccountRowDtoToJson(
  AdminPayoutAccountRowDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'user': ?instance.user?.toJson(),
  'email': ?instance.email,
  'stripeAccountId': instance.stripeAccountId,
  'status': instance.status.toJson(),
  'chargesEnabled': instance.chargesEnabled,
  'payoutsEnabled': instance.payoutsEnabled,
  'requirementsDue': instance.requirementsDue,
  'disabledReason': ?instance.disabledReason,
  'receivedCents': instance.receivedCents,
  'processingFeePayer': ?instance.processingFeePayer?.toJson(),
  'lastSyncedAt': ?instance.lastSyncedAt?.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
};
