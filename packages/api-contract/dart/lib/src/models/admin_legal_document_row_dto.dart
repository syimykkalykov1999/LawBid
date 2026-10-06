// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_document_row_dto_doc_type.dart';
import 'admin_legal_locale_state_dto.dart';

part 'admin_legal_document_row_dto.g.dart';

@JsonSerializable()
class AdminLegalDocumentRowDto {
  const AdminLegalDocumentRowDto({
    required this.docType,
    required this.titleEn,
    required this.titleRu,
    required this.locales,
  });

  factory AdminLegalDocumentRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminLegalDocumentRowDtoFromJson(json);

  final AdminLegalDocumentRowDtoDocType docType;
  final String titleEn;
  final String titleRu;
  final List<AdminLegalLocaleStateDto> locales;

  Map<String, Object?> toJson() => _$AdminLegalDocumentRowDtoToJson(this);
}
