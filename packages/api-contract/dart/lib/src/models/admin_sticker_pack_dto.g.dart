// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_pack_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerPackDto _$AdminStickerPackDtoFromJson(Map<String, dynamic> json) =>
    AdminStickerPackDto(
      id: json['id'] as String,
      title: json['title'] as String,
      shortName: json['shortName'] as String,
      isOfficial: json['isOfficial'] as bool,
      status: AdminStickerPackDtoStatus.fromJson(json['status'] as String),
      stickerCount: (json['stickerCount'] as num).toInt(),
      installCount: (json['installCount'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      stickers: (json['stickers'] as List<dynamic>)
          .map((e) => AdminStickerDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      ownerId: json['ownerId'] as String?,
      ownerName: json['ownerName'] as String?,
    );

Map<String, dynamic> _$AdminStickerPackDtoToJson(
  AdminStickerPackDto instance,
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
  'stickers': instance.stickers.map((e) => e.toJson()).toList(),
};
