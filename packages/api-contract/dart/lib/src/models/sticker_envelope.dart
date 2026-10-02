// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sticker_dto.dart';

part 'sticker_envelope.g.dart';

@JsonSerializable()
class StickerEnvelope {
  const StickerEnvelope({required this.data, this.meta});

  factory StickerEnvelope.fromJson(Map<String, Object?> json) =>
      _$StickerEnvelopeFromJson(json);

  final StickerDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StickerEnvelopeToJson(this);
}
