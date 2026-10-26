// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_cancel_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCancelSubscriptionDto _$AdminCancelSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => AdminCancelSubscriptionDto(
  whenValue: AdminSubscriptionCancelWhen.fromJson(json['when'] as String),
  reason: json['reason'] as String? ?? '',
  refund: json['refund'] == null
      ? AdminSubscriptionCancelRefund.none
      : AdminSubscriptionCancelRefund.fromJson(json['refund'] as String),
);

Map<String, dynamic> _$AdminCancelSubscriptionDtoToJson(
  AdminCancelSubscriptionDto instance,
) => <String, dynamic>{
  'reason': instance.reason,
  'when': instance.whenValue.toJson(),
  'refund': instance.refund.toJson(),
};
