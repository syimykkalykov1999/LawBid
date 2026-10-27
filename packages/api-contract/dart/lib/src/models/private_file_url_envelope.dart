// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'private_file_url_dto.dart';
import 'response_meta_dto.dart';

part 'private_file_url_envelope.g.dart';

@JsonSerializable()
class PrivateFileUrlEnvelope {
  const PrivateFileUrlEnvelope({required this.data, this.meta});

  factory PrivateFileUrlEnvelope.fromJson(Map<String, Object?> json) =>
      _$PrivateFileUrlEnvelopeFromJson(json);

  final PrivateFileUrlDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PrivateFileUrlEnvelopeToJson(this);
}
