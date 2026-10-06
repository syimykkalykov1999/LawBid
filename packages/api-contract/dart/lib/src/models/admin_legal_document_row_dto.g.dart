// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_document_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalDocumentRowDto _$AdminLegalDocumentRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminLegalDocumentRowDto(
  docType: AdminLegalDocumentRowDtoDocType.fromJson(json['docType'] as String),
  titleEn: json['titleEn'] as String,
  titleRu: json['titleRu'] as String,
  locales: (json['locales'] as List<dynamic>)
      .map((e) => AdminLegalLocaleStateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AdminLegalDocumentRowDtoToJson(
  AdminLegalDocumentRowDto instance,
) => <String, dynamic>{
  'docType': instance.docType.toJson(),
  'titleEn': instance.titleEn,
  'titleRu': instance.titleRu,
  'locales': instance.locales.map((e) => e.toJson()).toList(),
};
