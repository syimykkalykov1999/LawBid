// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_document_detail_dto_doc_type.dart';
import 'admin_legal_locale_detail_dto.dart';

part 'admin_legal_document_detail_dto.g.dart';

@JsonSerializable()
class AdminLegalDocumentDetailDto {
  const AdminLegalDocumentDetailDto({
    required this.docType,
    required this.titleEn,
    required this.titleRu,
    required this.locales,
  });

  factory AdminLegalDocumentDetailDto.fromJson(Map<String, Object?> json) =>
      _$AdminLegalDocumentDetailDtoFromJson(json);

  final AdminLegalDocumentDetailDtoDocType docType;
  final String titleEn;
  final String titleRu;
  final List<AdminLegalLocaleDetailDto> locales;

  Map<String, Object?> toJson() => _$AdminLegalDocumentDetailDtoToJson(this);
}
