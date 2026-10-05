// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'translate_content_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TranslateContentDto _$TranslateContentDtoFromJson(Map<String, dynamic> json) =>
    TranslateContentDto(
      kind: TranslatableKind.fromJson(json['kind'] as String),
      id: json['id'] as String,
      target: json['target'] as String,
    );

Map<String, dynamic> _$TranslateContentDtoToJson(
  TranslateContentDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'id': instance.id,
  'target': instance.target,
};
