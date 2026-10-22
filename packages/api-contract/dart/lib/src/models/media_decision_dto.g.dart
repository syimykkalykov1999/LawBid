// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'media_decision_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MediaDecisionDto _$MediaDecisionDtoFromJson(Map<String, dynamic> json) =>
    MediaDecisionDto(
      decision: MediaDecisionDtoDecision.fromJson(json['decision'] as String),
    );

Map<String, dynamic> _$MediaDecisionDtoToJson(MediaDecisionDto instance) =>
    <String, dynamic>{'decision': instance.decision.toJson()};
