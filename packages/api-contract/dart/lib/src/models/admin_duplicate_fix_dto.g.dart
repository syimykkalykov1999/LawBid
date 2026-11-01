// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_duplicate_fix_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDuplicateFixDto _$AdminDuplicateFixDtoFromJson(
  Map<String, dynamic> json,
) => AdminDuplicateFixDto(
  id: json['id'] as String,
  userId: json['userId'] as String,
  user: json['user'] == null
      ? null
      : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
  keptSubscriptionId: json['keptSubscriptionId'] as String,
  duplicateSubscriptionId: json['duplicateSubscriptionId'] as String,
  trigger: AdminDuplicateFixDtoTrigger.fromJson(json['trigger'] as String),
  status: DuplicateSubscriptionFixStatus.fromJson(json['status'] as String),
  reason: json['reason'] as String?,
  chargedCents: (json['chargedCents'] as num).toInt(),
  refundCents: (json['refundCents'] as num).toInt(),
  currency: json['currency'] as String,
  refundId: json['refundId'] as String?,
  canceledAt: json['canceledAt'] == null
      ? null
      : DateTime.parse(json['canceledAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminDuplicateFixDtoToJson(
  AdminDuplicateFixDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'user': ?instance.user?.toJson(),
  'keptSubscriptionId': instance.keptSubscriptionId,
  'duplicateSubscriptionId': instance.duplicateSubscriptionId,
  'trigger': instance.trigger.toJson(),
  'status': instance.status.toJson(),
  'reason': ?instance.reason,
  'chargedCents': instance.chargedCents,
  'refundCents': instance.refundCents,
  'currency': instance.currency,
  'refundId': ?instance.refundId,
  'canceledAt': ?instance.canceledAt?.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
};
