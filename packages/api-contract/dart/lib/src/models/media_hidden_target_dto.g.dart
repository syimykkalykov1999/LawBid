// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'media_hidden_target_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MediaHiddenTargetDto _$MediaHiddenTargetDtoFromJson(
  Map<String, dynamic> json,
) => MediaHiddenTargetDto(
  type: MediaHiddenTargetDtoType.fromJson(json['type'] as String),
  id: json['id'] as String,
);

Map<String, dynamic> _$MediaHiddenTargetDtoToJson(
  MediaHiddenTargetDto instance,
) => <String, dynamic>{'type': instance.type.toJson(), 'id': instance.id};
