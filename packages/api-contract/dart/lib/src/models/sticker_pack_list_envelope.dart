// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sticker_pack_dto.dart';

part 'sticker_pack_list_envelope.g.dart';

@JsonSerializable()
class StickerPackListEnvelope {
  const StickerPackListEnvelope({required this.data, this.meta});

  factory StickerPackListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StickerPackListEnvelopeFromJson(json);

  final List<StickerPackDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StickerPackListEnvelopeToJson(this);
}
