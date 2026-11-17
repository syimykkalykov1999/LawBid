// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_packs_filter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerPacksFilterDto _$AdminStickerPacksFilterDtoFromJson(
  Map<String, dynamic> json,
) => AdminStickerPacksFilterDto(
  kind: json['kind'] == null
      ? null
      : AdminStickerPacksFilterDtoKind.fromJson(json['kind'] as String),
  status: json['status'] == null
      ? null
      : AdminStickerPacksFilterDtoStatus.fromJson(json['status'] as String),
  q: json['q'] as String?,
);

Map<String, dynamic> _$AdminStickerPacksFilterDtoToJson(
  AdminStickerPacksFilterDto instance,
) => <String, dynamic>{
  'kind': ?instance.kind?.toJson(),
  'status': ?instance.status?.toJson(),
  'q': ?instance.q,
};
