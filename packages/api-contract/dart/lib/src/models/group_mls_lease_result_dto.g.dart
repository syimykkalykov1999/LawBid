// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_mls_lease_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMlsLeaseResultDto _$GroupMlsLeaseResultDtoFromJson(
  Map<String, dynamic> json,
) => GroupMlsLeaseResultDto(
  granted: json['granted'] as bool,
  ttlMs: json['ttlMs'] as num,
  holderDeviceId: json['holderDeviceId'] as String?,
);

Map<String, dynamic> _$GroupMlsLeaseResultDtoToJson(
  GroupMlsLeaseResultDto instance,
) => <String, dynamic>{
  'granted': instance.granted,
  'holderDeviceId': ?instance.holderDeviceId,
  'ttlMs': instance.ttlMs,
};
