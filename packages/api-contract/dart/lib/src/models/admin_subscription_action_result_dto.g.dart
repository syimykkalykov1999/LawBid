// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_subscription_action_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSubscriptionActionResultDto _$AdminSubscriptionActionResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminSubscriptionActionResultDto(
  status: json['status'] as String,
  cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
  accessEndsAt: json['accessEndsAt'] == null
      ? null
      : DateTime.parse(json['accessEndsAt'] as String),
  refund: json['refund'] == null
      ? null
      : AdminSubscriptionRefundOutcomeDto.fromJson(
          json['refund'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$AdminSubscriptionActionResultDtoToJson(
  AdminSubscriptionActionResultDto instance,
) => <String, dynamic>{
  'status': instance.status,
  'cancelAtPeriodEnd': instance.cancelAtPeriodEnd,
  'accessEndsAt': ?instance.accessEndsAt?.toIso8601String(),
  'refund': ?instance.refund?.toJson(),
};
