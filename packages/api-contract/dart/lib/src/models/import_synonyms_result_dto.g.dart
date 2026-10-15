// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'import_synonyms_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ImportSynonymsResultDto _$ImportSynonymsResultDtoFromJson(
  Map<String, dynamic> json,
) => ImportSynonymsResultDto(
  groupsCreated: json['groupsCreated'] as num,
  groupsUpdated: json['groupsUpdated'] as num,
  termsAdded: json['termsAdded'] as num,
  unknownPractices: (json['unknownPractices'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ImportSynonymsResultDtoToJson(
  ImportSynonymsResultDto instance,
) => <String, dynamic>{
  'groupsCreated': instance.groupsCreated,
  'groupsUpdated': instance.groupsUpdated,
  'termsAdded': instance.termsAdded,
  'unknownPractices': instance.unknownPractices,
};
