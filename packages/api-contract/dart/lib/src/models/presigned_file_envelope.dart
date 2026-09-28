// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'presigned_file_dto.dart';
import 'response_meta_dto.dart';

part 'presigned_file_envelope.g.dart';

@JsonSerializable()
class PresignedFileEnvelope {
  const PresignedFileEnvelope({required this.data, this.meta});

  factory PresignedFileEnvelope.fromJson(Map<String, Object?> json) =>
      _$PresignedFileEnvelopeFromJson(json);

  final PresignedFileDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PresignedFileEnvelopeToJson(this);
}
