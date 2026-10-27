// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resolve_no_show_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResolveNoShowDto _$ResolveNoShowDtoFromJson(Map<String, dynamic> json) =>
    ResolveNoShowDto(
      decision: ResolveNoShowDtoDecision.fromJson(json['decision'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$ResolveNoShowDtoToJson(ResolveNoShowDto instance) =>
    <String, dynamic>{
      'decision': instance.decision.toJson(),
      'note': ?instance.note,
    };
