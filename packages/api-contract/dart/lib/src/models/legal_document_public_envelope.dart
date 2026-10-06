// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_document_public_dto.dart';
import 'response_meta_dto.dart';

part 'legal_document_public_envelope.g.dart';

@JsonSerializable()
class LegalDocumentPublicEnvelope {
  const LegalDocumentPublicEnvelope({required this.data, this.meta});

  factory LegalDocumentPublicEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalDocumentPublicEnvelopeFromJson(json);

  final LegalDocumentPublicDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalDocumentPublicEnvelopeToJson(this);
}
