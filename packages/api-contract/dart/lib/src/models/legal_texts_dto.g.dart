// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_texts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalTextsDto _$LegalTextsDtoFromJson(Map<String, dynamic> json) =>
    LegalTextsDto(
      caseCreate: json['caseCreate'] as String,
      attorneyUnverified: json['attorneyUnverified'] as String,
      supportNote: json['supportNote'] as String,
      partnerDisclosure: json['partnerDisclosure'] as String,
      partnerTerms: json['partnerTerms'] as String,
    );

Map<String, dynamic> _$LegalTextsDtoToJson(LegalTextsDto instance) =>
    <String, dynamic>{
      'caseCreate': instance.caseCreate,
      'attorneyUnverified': instance.attorneyUnverified,
      'supportNote': instance.supportNote,
      'partnerDisclosure': instance.partnerDisclosure,
      'partnerTerms': instance.partnerTerms,
    };
