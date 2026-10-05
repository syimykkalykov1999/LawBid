// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_storage_quota_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserStorageQuotaDto _$UserStorageQuotaDtoFromJson(Map<String, dynamic> json) =>
    UserStorageQuotaDto(
      userId: json['userId'] as String,
      quotaMb: json['quotaMb'] as num?,
      usedBytes: json['usedBytes'] as num,
      quotaBytes: json['quotaBytes'] as num?,
    );

Map<String, dynamic> _$UserStorageQuotaDtoToJson(
  UserStorageQuotaDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'quotaMb': ?instance.quotaMb,
  'usedBytes': instance.usedBytes,
  'quotaBytes': ?instance.quotaBytes,
};
