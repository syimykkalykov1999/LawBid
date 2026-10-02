// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerUploadDto _$AdminStickerUploadDtoFromJson(
  Map<String, dynamic> json,
) => AdminStickerUploadDto(
  mime: AdminStickerUploadDtoMime.fromJson(json['mime'] as String),
  sizeBytes: json['sizeBytes'] as num,
  sha256: json['sha256'] as String,
);

Map<String, dynamic> _$AdminStickerUploadDtoToJson(
  AdminStickerUploadDto instance,
) => <String, dynamic>{
  'mime': instance.mime.toJson(),
  'sizeBytes': instance.sizeBytes,
  'sha256': instance.sha256,
};
