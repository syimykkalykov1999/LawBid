// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sticker_pack_dto.dart';

part 'sticker_pack_envelope.g.dart';

@JsonSerializable()
class StickerPackEnvelope {
  const StickerPackEnvelope({required this.data, this.meta});

  factory StickerPackEnvelope.fromJson(Map<String, Object?> json) =>
      _$StickerPackEnvelopeFromJson(json);

  final StickerPackDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StickerPackEnvelopeToJson(this);
}
