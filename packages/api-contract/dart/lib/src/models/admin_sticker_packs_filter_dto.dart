// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_packs_filter_dto_kind.dart';
import 'admin_sticker_packs_filter_dto_status.dart';

part 'admin_sticker_packs_filter_dto.g.dart';

@JsonSerializable()
class AdminStickerPacksFilterDto {
  const AdminStickerPacksFilterDto({this.kind, this.status, this.q});

  factory AdminStickerPacksFilterDto.fromJson(Map<String, Object?> json) =>
      _$AdminStickerPacksFilterDtoFromJson(json);

  final AdminStickerPacksFilterDtoKind? kind;
  final AdminStickerPacksFilterDtoStatus? status;

  /// Title or short name.
  final String? q;

  Map<String, Object?> toJson() => _$AdminStickerPacksFilterDtoToJson(this);
}
