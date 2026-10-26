// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_subscription_refund_outcome_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSubscriptionRefundOutcomeDto _$AdminSubscriptionRefundOutcomeDtoFromJson(
  Map<String, dynamic> json,
) => AdminSubscriptionRefundOutcomeDto(
  amountCents: (json['amountCents'] as num).toInt(),
  status: AdminSubscriptionRefundOutcomeDtoStatus.fromJson(
    json['status'] as String,
  ),
  message: json['message'] as String?,
);

Map<String, dynamic> _$AdminSubscriptionRefundOutcomeDtoToJson(
  AdminSubscriptionRefundOutcomeDto instance,
) => <String, dynamic>{
  'amountCents': instance.amountCents,
  'status': instance.status.toJson(),
  'message': ?instance.message,
};
