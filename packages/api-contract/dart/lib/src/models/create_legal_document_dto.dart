// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_legal_document_dto_doc_type.dart';

part 'create_legal_document_dto.g.dart';

@JsonSerializable()
class CreateLegalDocumentDto {
  const CreateLegalDocumentDto({
    required this.docType,
    required this.locale,
    required this.version,
    this.contentMd,
    this.contentUrl,
  });

  factory CreateLegalDocumentDto.fromJson(Map<String, Object?> json) =>
      _$CreateLegalDocumentDtoFromJson(json);

  final CreateLegalDocumentDtoDocType docType;
  final String locale;
  final String version;

  /// Markdown body (either this or contentUrl).
  final String? contentMd;
  final String? contentUrl;

  Map<String, Object?> toJson() => _$CreateLegalDocumentDtoToJson(this);
}
