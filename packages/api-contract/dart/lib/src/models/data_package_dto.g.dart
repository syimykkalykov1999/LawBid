// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_package_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataPackageDto _$DataPackageDtoFromJson(Map<String, dynamic> json) =>
    DataPackageDto(
      requestId: json['requestId'] as String,
      referenceNumber: json['referenceNumber'] as String,
      preparedAt: DateTime.parse(json['preparedAt'] as String),
      sections: (json['sections'] as List<dynamic>)
          .map((e) => DataPackageDtoSections.fromJson(e as String))
          .toList(),
      data: json['data'],
      loggedEntities: (json['loggedEntities'] as num).toInt(),
    );

Map<String, dynamic> _$DataPackageDtoToJson(DataPackageDto instance) =>
    <String, dynamic>{
      'requestId': instance.requestId,
      'referenceNumber': instance.referenceNumber,
      'preparedAt': instance.preparedAt.toIso8601String(),
      'sections': instance.sections.map((e) => e.toJson()).toList(),
      'data': ?instance.data,
      'loggedEntities': instance.loggedEntities,
    };
