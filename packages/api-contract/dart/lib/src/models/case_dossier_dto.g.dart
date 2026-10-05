// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_dossier_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseDossierDto _$CaseDossierDtoFromJson(Map<String, dynamic> json) =>
    CaseDossierDto(
      imagesCount: (json['imagesCount'] as num).toInt(),
      documentsCount: (json['documentsCount'] as num).toInt(),
      descriptionLength: (json['descriptionLength'] as num).toInt(),
    );

Map<String, dynamic> _$CaseDossierDtoToJson(CaseDossierDto instance) =>
    <String, dynamic>{
      'imagesCount': instance.imagesCount,
      'documentsCount': instance.documentsCount,
      'descriptionLength': instance.descriptionLength,
    };
