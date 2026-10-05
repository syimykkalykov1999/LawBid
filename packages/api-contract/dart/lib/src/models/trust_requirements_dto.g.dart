// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_requirements_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustRequirementsDto _$TrustRequirementsDtoFromJson(
  Map<String, dynamic> json,
) => TrustRequirementsDto(
  registry: json['registry'] as bool,
  identity: json['identity'] as bool,
  documents: json['documents'] as bool,
);

Map<String, dynamic> _$TrustRequirementsDtoToJson(
  TrustRequirementsDto instance,
) => <String, dynamic>{
  'registry': instance.registry,
  'identity': instance.identity,
  'documents': instance.documents,
};
