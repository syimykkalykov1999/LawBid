// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'prepare_package_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PreparePackageDto _$PreparePackageDtoFromJson(Map<String, dynamic> json) =>
    PreparePackageDto(
      userId: json['userId'] as String,
      sections: (json['sections'] as List<dynamic>)
          .map((e) => PreparePackageDtoSections.fromJson(e as String))
          .toList(),
    );

Map<String, dynamic> _$PreparePackageDtoToJson(PreparePackageDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'sections': instance.sections.map((e) => e.toJson()).toList(),
    };
