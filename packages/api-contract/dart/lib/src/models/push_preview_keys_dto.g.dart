// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_preview_keys_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PushPreviewKeysDto _$PushPreviewKeysDtoFromJson(Map<String, dynamic> json) =>
    PushPreviewKeysDto(
      keys: (json['keys'] as List<dynamic>)
          .map((e) => PushPreviewKeyDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PushPreviewKeysDtoToJson(PushPreviewKeysDto instance) =>
    <String, dynamic>{'keys': instance.keys.map((e) => e.toJson()).toList()};
