// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_file_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseFileInputDto _$CaseFileInputDtoFromJson(Map<String, dynamic> json) =>
    CaseFileInputDto(
      fileId: json['fileId'] as String,
      description: json['description'] as String?,
    );

Map<String, dynamic> _$CaseFileInputDtoToJson(CaseFileInputDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'description': ?instance.description,
    };
