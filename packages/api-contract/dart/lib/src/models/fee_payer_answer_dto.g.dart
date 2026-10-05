// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fee_payer_answer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeePayerAnswerDto _$FeePayerAnswerDtoFromJson(Map<String, dynamic> json) =>
    FeePayerAnswerDto(
      action: FeePayerAnswerDtoAction.fromJson(json['action'] as String),
      processingFeePayer: json['processingFeePayer'] == null
          ? null
          : ProcessingFeePayer.fromJson(json['processingFeePayer'] as String),
    );

Map<String, dynamic> _$FeePayerAnswerDtoToJson(FeePayerAnswerDto instance) =>
    <String, dynamic>{
      'action': instance.action.toJson(),
      'processingFeePayer': ?instance.processingFeePayer?.toJson(),
    };
