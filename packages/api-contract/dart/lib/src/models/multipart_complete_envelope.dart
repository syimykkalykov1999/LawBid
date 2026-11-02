// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'multipart_complete_dto.dart';
import 'response_meta_dto.dart';

part 'multipart_complete_envelope.g.dart';

@JsonSerializable()
class MultipartCompleteEnvelope {
  const MultipartCompleteEnvelope({required this.data, this.meta});

  factory MultipartCompleteEnvelope.fromJson(Map<String, Object?> json) =>
      _$MultipartCompleteEnvelopeFromJson(json);

  final MultipartCompleteDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MultipartCompleteEnvelopeToJson(this);
}
