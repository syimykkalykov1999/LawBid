// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stripe_dispute_submit_result_dto.g.dart';

@JsonSerializable()
class StripeDisputeSubmitResultDto {
  const StripeDisputeSubmitResultDto({
    required this.status,
    required this.submissionCount,
  });

  factory StripeDisputeSubmitResultDto.fromJson(Map<String, Object?> json) =>
      _$StripeDisputeSubmitResultDtoFromJson(json);

  final String status;
  final int submissionCount;

  Map<String, Object?> toJson() => _$StripeDisputeSubmitResultDtoToJson(this);
}
