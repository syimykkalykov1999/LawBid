// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_pack_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_sticker_pack_row_list_envelope.g.dart';

@JsonSerializable()
class AdminStickerPackRowListEnvelope {
  const AdminStickerPackRowListEnvelope({required this.data, this.meta});

  factory AdminStickerPackRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminStickerPackRowListEnvelopeFromJson(json);

  final List<AdminStickerPackRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminStickerPackRowListEnvelopeToJson(this);
}
