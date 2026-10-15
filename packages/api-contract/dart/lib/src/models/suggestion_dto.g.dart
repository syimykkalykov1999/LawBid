// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SuggestionDto _$SuggestionDtoFromJson(Map<String, dynamic> json) =>
    SuggestionDto(
      kind: SuggestionDtoKind.fromJson(json['kind'] as String),
      text: json['text'] as String,
    );

Map<String, dynamic> _$SuggestionDtoToJson(SuggestionDto instance) =>
    <String, dynamic>{'kind': instance.kind.toJson(), 'text': instance.text};
