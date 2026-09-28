// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'file_dto.dart';
import 'response_meta_dto.dart';

part 'file_envelope.g.dart';

@JsonSerializable()
class FileEnvelope {
  const FileEnvelope({required this.data, this.meta});

  factory FileEnvelope.fromJson(Map<String, Object?> json) =>
      _$FileEnvelopeFromJson(json);

  final FileDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FileEnvelopeToJson(this);
}
