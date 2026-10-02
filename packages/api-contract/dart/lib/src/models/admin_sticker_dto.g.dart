// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerDto _$AdminStickerDtoFromJson(Map<String, dynamic> json) =>
    AdminStickerDto(
      id: json['id'] as String,
      fileId: json['fileId'] as String,
      emoji: json['emoji'] as String,
      position: (json['position'] as num).toInt(),
      url: json['url'] as String?,
    );

Map<String, dynamic> _$AdminStickerDtoToJson(AdminStickerDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'fileId': instance.fileId,
      'emoji': instance.emoji,
      'position': instance.position,
      'url': ?instance.url,
    };
