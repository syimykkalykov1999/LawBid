// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_case_files_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateCaseFilesDto _$PrivateCaseFilesDtoFromJson(Map<String, dynamic> json) =>
    PrivateCaseFilesDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => PrivateCaseFileDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PrivateCaseFilesDtoToJson(
  PrivateCaseFilesDto instance,
) => <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
