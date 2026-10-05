// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_storage_quota_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserStorageQuotaEnvelope _$UserStorageQuotaEnvelopeFromJson(
  Map<String, dynamic> json,
) => UserStorageQuotaEnvelope(
  data: UserStorageQuotaDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$UserStorageQuotaEnvelopeToJson(
  UserStorageQuotaEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
