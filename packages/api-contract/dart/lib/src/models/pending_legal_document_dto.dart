// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pending_legal_document_dto_doc_type.dart';
import 'pending_legal_document_dto_locale.dart';
import 'pending_legal_document_dto_reason.dart';

part 'pending_legal_document_dto.g.dart';

@JsonSerializable()
class PendingLegalDocumentDto {
  const PendingLegalDocumentDto({
    required this.id,
    required this.docType,
    required this.locale,
    required this.version,
    required this.title,
    required this.publishedAt,
    required this.reason,
  });

  factory PendingLegalDocumentDto.fromJson(Map<String, Object?> json) =>
      _$PendingLegalDocumentDtoFromJson(json);

  final String id;
  final PendingLegalDocumentDtoDocType docType;
  final PendingLegalDocumentDtoLocale locale;
  final String version;
  final String title;
  final DateTime? publishedAt;

  /// `new` — never accepted; `updated` — a material change.
  final PendingLegalDocumentDtoReason reason;

  Map<String, Object?> toJson() => _$PendingLegalDocumentDtoToJson(this);
}
