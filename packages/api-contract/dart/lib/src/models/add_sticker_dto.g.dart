// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_sticker_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddStickerDto _$AddStickerDtoFromJson(Map<String, dynamic> json) =>
    AddStickerDto(
      fileId: json['fileId'] as String,
      emoji: json['emoji'] as String? ?? '🙂',
    );

Map<String, dynamic> _$AddStickerDtoToJson(AddStickerDto instance) =>
    <String, dynamic>{'fileId': instance.fileId, 'emoji': instance.emoji};
