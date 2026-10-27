// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_dispute_submit_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeDisputeSubmitResultDto _$StripeDisputeSubmitResultDtoFromJson(
  Map<String, dynamic> json,
) => StripeDisputeSubmitResultDto(
  status: json['status'] as String,
  submissionCount: (json['submissionCount'] as num).toInt(),
);

Map<String, dynamic> _$StripeDisputeSubmitResultDtoToJson(
  StripeDisputeSubmitResultDto instance,
) => <String, dynamic>{
  'status': instance.status,
  'submissionCount': instance.submissionCount,
};
