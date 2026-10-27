// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_connection_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarConnectionDto _$CalendarConnectionDtoFromJson(
  Map<String, dynamic> json,
) => CalendarConnectionDto(
  provider: CalendarConnectionDtoProvider.fromJson(json['provider'] as String),
  status: CalendarConnectionDtoStatus.fromJson(json['status'] as String),
  readBusy: json['readBusy'] as bool,
  writeEvents: json['writeEvents'] as bool,
  accountEmail: json['accountEmail'] as String?,
  lastSyncAt: json['lastSyncAt'] as String?,
  lastError: json['lastError'] as String?,
);

Map<String, dynamic> _$CalendarConnectionDtoToJson(
  CalendarConnectionDto instance,
) => <String, dynamic>{
  'provider': instance.provider.toJson(),
  'accountEmail': ?instance.accountEmail,
  'status': instance.status.toJson(),
  'readBusy': instance.readBusy,
  'writeEvents': instance.writeEvents,
  'lastSyncAt': ?instance.lastSyncAt,
  'lastError': ?instance.lastError,
};
