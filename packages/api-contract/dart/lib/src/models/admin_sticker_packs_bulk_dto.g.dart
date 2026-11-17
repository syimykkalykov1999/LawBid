// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_sticker_packs_bulk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStickerPacksBulkDto _$AdminStickerPacksBulkDtoFromJson(
  Map<String, dynamic> json,
) => AdminStickerPacksBulkDto(
  ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
  filter: json['filter'] == null
      ? null
      : AdminStickerPacksFilterDto.fromJson(
          json['filter'] as Map<String, dynamic>,
        ),
  reason: json['reason'] as String? ?? '',
);

Map<String, dynamic> _$AdminStickerPacksBulkDtoToJson(
  AdminStickerPacksBulkDto instance,
) => <String, dynamic>{
  'reason': instance.reason,
  'ids': ?instance.ids,
  'filter': ?instance.filter?.toJson(),
};
