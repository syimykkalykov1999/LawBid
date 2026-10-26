// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'economy_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EconomyEventDto _$EconomyEventDtoFromJson(Map<String, dynamic> json) =>
    EconomyEventDto(
      at: json['at'] as String,
      kind: EconomyEventDtoKind.fromJson(json['kind'] as String),
      text: json['text'] as String,
    );

Map<String, dynamic> _$EconomyEventDtoToJson(EconomyEventDto instance) =>
    <String, dynamic>{
      'at': instance.at,
      'kind': instance.kind.toJson(),
      'text': instance.text,
    };
