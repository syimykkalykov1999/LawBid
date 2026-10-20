// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'built_document_dto.dart';
import 'response_meta_dto.dart';

part 'built_document_envelope.g.dart';

@JsonSerializable()
class BuiltDocumentEnvelope {
  const BuiltDocumentEnvelope({required this.data, this.meta});

  factory BuiltDocumentEnvelope.fromJson(Map<String, Object?> json) =>
      _$BuiltDocumentEnvelopeFromJson(json);

  final BuiltDocumentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BuiltDocumentEnvelopeToJson(this);
}
