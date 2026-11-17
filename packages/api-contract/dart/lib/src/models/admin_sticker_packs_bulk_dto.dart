// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_packs_filter_dto.dart';

part 'admin_sticker_packs_bulk_dto.g.dart';

@JsonSerializable()
class AdminStickerPacksBulkDto {
  const AdminStickerPacksBulkDto({this.ids, this.filter, this.reason = ''});

  factory AdminStickerPacksBulkDto.fromJson(Map<String, Object?> json) =>
      _$AdminStickerPacksBulkDtoFromJson(json);

  final String reason;

  /// Exactly one of `ids` or `filter`. Staff: at most 500; the owner: any number (processed in chunks).
  final List<String>? ids;

  /// Row 179 B6: «select all by filter» — the list filter; the server resolves the ids (staff: at most `admin.bulk_select_cap`) and audits the filter.
  final AdminStickerPacksFilterDto? filter;

  Map<String, Object?> toJson() => _$AdminStickerPacksBulkDtoToJson(this);
}
