// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_ai_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAiSummaryDto _$StaffAiSummaryDtoFromJson(Map<String, dynamic> json) =>
    StaffAiSummaryDto(
      available: json['available'] as bool,
      source: StaffAiSummarySource.fromJson(json['source'] as String),
      text: json['text'] as String?,
      model: json['model'] as String?,
      at: json['at'] as String?,
    );

Map<String, dynamic> _$StaffAiSummaryDtoToJson(StaffAiSummaryDto instance) =>
    <String, dynamic>{
      'available': instance.available,
      'source': instance.source.toJson(),
      'text': ?instance.text,
      'model': ?instance.model,
      'at': ?instance.at,
    };
