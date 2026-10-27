// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_disclaimer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalDisclaimerDto _$LegalDisclaimerDtoFromJson(Map<String, dynamic> json) =>
    LegalDisclaimerDto(
      text: json['text'] as String,
      version: json['version'] as String,
      kind: LegalDisclaimerDtoKind.fromJson(json['kind'] as String),
      stateCode: json['stateCode'] as String?,
    );

Map<String, dynamic> _$LegalDisclaimerDtoToJson(LegalDisclaimerDto instance) =>
    <String, dynamic>{
      'text': instance.text,
      'version': instance.version,
      'stateCode': ?instance.stateCode,
      'kind': instance.kind.toJson(),
    };
