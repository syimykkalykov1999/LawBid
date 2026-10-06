// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_public_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalPublicDto _$LegalPublicDtoFromJson(Map<String, dynamic> json) =>
    LegalPublicDto(
      dmcaAgent: DmcaAgentDto.fromJson(
        json['dmcaAgent'] as Map<String, dynamic>,
      ),
      texts: LegalTextsDto.fromJson(json['texts'] as Map<String, dynamic>),
      partnerTermsVersion: json['partnerTermsVersion'] as String,
    );

Map<String, dynamic> _$LegalPublicDtoToJson(LegalPublicDto instance) =>
    <String, dynamic>{
      'dmcaAgent': instance.dmcaAgent.toJson(),
      'texts': instance.texts.toJson(),
      'partnerTermsVersion': instance.partnerTermsVersion,
    };
