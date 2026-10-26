// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'media_check_page_dto.dart';
import 'response_meta_dto.dart';

part 'media_check_page_envelope.g.dart';

@JsonSerializable()
class MediaCheckPageEnvelope {
  const MediaCheckPageEnvelope({required this.data, this.meta});

  factory MediaCheckPageEnvelope.fromJson(Map<String, Object?> json) =>
      _$MediaCheckPageEnvelopeFromJson(json);

  final MediaCheckPageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MediaCheckPageEnvelopeToJson(this);
}
