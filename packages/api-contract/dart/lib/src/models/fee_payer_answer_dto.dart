// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fee_payer_answer_dto_action.dart';
import 'processing_fee_payer.dart';

part 'fee_payer_answer_dto.g.dart';

@JsonSerializable()
class FeePayerAnswerDto {
  const FeePayerAnswerDto({required this.action, this.processingFeePayer});

  factory FeePayerAnswerDto.fromJson(Map<String, Object?> json) =>
      _$FeePayerAnswerDtoFromJson(json);

  final FeePayerAnswerDtoAction action;

  /// Required for counter.
  final ProcessingFeePayer? processingFeePayer;

  Map<String, Object?> toJson() => _$FeePayerAnswerDtoToJson(this);
}
