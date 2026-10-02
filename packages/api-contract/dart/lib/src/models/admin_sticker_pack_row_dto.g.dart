// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_pack_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerPackRowDto _$AdminStickerPackRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminStickerPackRowDto(
  id: json['id'] as String,
  title: json['title'] as String,
  shortName: json['shortName'] as String,
  isOfficial: json['isOfficial'] as bool,
  status: AdminStickerPackRowDtoStatus.fromJson(json['status'] as String),
  stickerCount: (json['stickerCount'] as num).toInt(),
  installCount: (json['installCount'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  ownerId: json['ownerId'] as String?,
  ownerName: json['ownerName'] as String?,
);

Map<String, dynamic> _$AdminStickerPackRowDtoToJson(
  AdminStickerPackRowDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'shortName': instance.shortName,
  'isOfficial': instance.isOfficial,
  'status': instance.status.toJson(),
  'ownerId': ?instance.ownerId,
  'ownerName': ?instance.ownerName,
  'stickerCount': instance.stickerCount,
  'installCount': instance.installCount,
  'createdAt': instance.createdAt.toIso8601String(),
};
