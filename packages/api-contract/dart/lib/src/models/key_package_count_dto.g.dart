// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'key_package_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

KeyPackageCountDto _$KeyPackageCountDtoFromJson(Map<String, dynamic> json) =>
    KeyPackageCountDto(
      oneTime: json['oneTime'] as num,
      lastResort: json['lastResort'] as bool,
      target: json['target'] as num,
    );

Map<String, dynamic> _$KeyPackageCountDtoToJson(KeyPackageCountDto instance) =>
    <String, dynamic>{
      'oneTime': instance.oneTime,
      'lastResort': instance.lastResort,
      'target': instance.target,
    };
