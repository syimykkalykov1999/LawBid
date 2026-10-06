// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_document_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalDocumentDetailDto _$AdminLegalDocumentDetailDtoFromJson(
  Map<String, dynamic> json,
) => AdminLegalDocumentDetailDto(
  docType: AdminLegalDocumentDetailDtoDocType.fromJson(
    json['docType'] as String,
  ),
  titleEn: json['titleEn'] as String,
  titleRu: json['titleRu'] as String,
  locales: (json['locales'] as List<dynamic>)
      .map((e) => AdminLegalLocaleDetailDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AdminLegalDocumentDetailDtoToJson(
  AdminLegalDocumentDetailDto instance,
) => <String, dynamic>{
  'docType': instance.docType.toJson(),
  'titleEn': instance.titleEn,
  'titleRu': instance.titleRu,
  'locales': instance.locales.map((e) => e.toJson()).toList(),
};
