// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_ai_hint_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAiHintDto _$StaffAiHintDtoFromJson(Map<String, dynamic> json) =>
    StaffAiHintDto(
      available: json['available'] as bool,
      cached: json['cached'] as bool,
      suggestion: json['suggestion'] as String?,
      reason: json['reason'] as String?,
      confidence: json['confidence'] as num?,
      model: json['model'] as String?,
      unavailable: json['unavailable'] == null
          ? null
          : StaffAiHintUnavailable.fromJson(json['unavailable'] as String),
    );

Map<String, dynamic> _$StaffAiHintDtoToJson(StaffAiHintDto instance) =>
    <String, dynamic>{
      'available': instance.available,
      'suggestion': ?instance.suggestion,
      'reason': ?instance.reason,
      'confidence': ?instance.confidence,
      'model': ?instance.model,
      'cached': instance.cached,
      'unavailable': ?instance.unavailable?.toJson(),
    };
