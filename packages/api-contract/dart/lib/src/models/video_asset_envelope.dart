// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'video_asset_dto.dart';

part 'video_asset_envelope.g.dart';

@JsonSerializable()
class VideoAssetEnvelope {
  const VideoAssetEnvelope({required this.data, this.meta});

  factory VideoAssetEnvelope.fromJson(Map<String, Object?> json) =>
      _$VideoAssetEnvelopeFromJson(json);

  final VideoAssetDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$VideoAssetEnvelopeToJson(this);
}
