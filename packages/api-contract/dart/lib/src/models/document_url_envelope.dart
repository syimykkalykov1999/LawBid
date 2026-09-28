// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'document_url_dto.dart';
import 'response_meta_dto.dart';

part 'document_url_envelope.g.dart';

@JsonSerializable()
class DocumentUrlEnvelope {
  const DocumentUrlEnvelope({required this.data, this.meta});

  factory DocumentUrlEnvelope.fromJson(Map<String, Object?> json) =>
      _$DocumentUrlEnvelopeFromJson(json);

  final DocumentUrlDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DocumentUrlEnvelopeToJson(this);
}
