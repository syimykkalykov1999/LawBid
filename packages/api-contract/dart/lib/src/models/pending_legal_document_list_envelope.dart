// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pending_legal_document_dto.dart';
import 'response_meta_dto.dart';

part 'pending_legal_document_list_envelope.g.dart';

@JsonSerializable()
class PendingLegalDocumentListEnvelope {
  const PendingLegalDocumentListEnvelope({required this.data, this.meta});

  factory PendingLegalDocumentListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$PendingLegalDocumentListEnvelopeFromJson(json);

  final List<PendingLegalDocumentDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$PendingLegalDocumentListEnvelopeToJson(this);
}
