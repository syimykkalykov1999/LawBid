// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_sticker_pack_dto.dart';
import 'response_meta_dto.dart';

part 'admin_sticker_pack_envelope.g.dart';

@JsonSerializable()
class AdminStickerPackEnvelope {
  const AdminStickerPackEnvelope({required this.data, this.meta});

  factory AdminStickerPackEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminStickerPackEnvelopeFromJson(json);

  final AdminStickerPackDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminStickerPackEnvelopeToJson(this);
}
