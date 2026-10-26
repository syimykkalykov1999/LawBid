// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_case_update_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCaseUpdateDto _$CreateCaseUpdateDtoFromJson(Map<String, dynamic> json) =>
    CreateCaseUpdateDto(
      body: json['body'] as String,
      files: (json['files'] as List<dynamic>)
          .map((e) => CaseFileInputDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CreateCaseUpdateDtoToJson(
  CreateCaseUpdateDto instance,
) => <String, dynamic>{
  'body': instance.body,
  'files': instance.files.map((e) => e.toJson()).toList(),
};
