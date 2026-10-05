// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_user_usage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageUserUsageDto _$StorageUserUsageDtoFromJson(Map<String, dynamic> json) =>
    StorageUserUsageDto(
      userId: json['userId'] as String,
      name: json['name'] as String?,
      email: json['email'] as String?,
      bytes: json['bytes'] as num,
      count: json['count'] as num,
      quotaMb: json['quotaMb'] as num?,
    );

Map<String, dynamic> _$StorageUserUsageDtoToJson(
  StorageUserUsageDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'name': ?instance.name,
  'email': ?instance.email,
  'bytes': instance.bytes,
  'count': instance.count,
  'quotaMb': ?instance.quotaMb,
};
