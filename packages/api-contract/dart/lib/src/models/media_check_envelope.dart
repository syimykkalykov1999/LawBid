// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'media_check_dto.dart';
import 'response_meta_dto.dart';

part 'media_check_envelope.g.dart';

@JsonSerializable()
class MediaCheckEnvelope {
  const MediaCheckEnvelope({required this.data, this.meta});

  factory MediaCheckEnvelope.fromJson(Map<String, Object?> json) =>
      _$MediaCheckEnvelopeFromJson(json);

  final MediaCheckDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MediaCheckEnvelopeToJson(this);
}
