// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'infra_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfraSuggestionDto _$InfraSuggestionDtoFromJson(Map<String, dynamic> json) =>
    InfraSuggestionDto(
      id: json['id'] as String,
      name: json['name'] as String,
      to: InfraSuggestionDtoTo.fromJson(json['to'] as String),
      reason: json['reason'] as String,
      costDeltaUsd: (json['costDeltaUsd'] as List<dynamic>)
          .map((e) => e as num)
          .toList(),
    );

Map<String, dynamic> _$InfraSuggestionDtoToJson(InfraSuggestionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'to': instance.to.toJson(),
      'reason': instance.reason,
      'costDeltaUsd': instance.costDeltaUsd,
    };
