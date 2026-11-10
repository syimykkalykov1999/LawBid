// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_realtime_ticket_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRealtimeTicketDto _$AdminRealtimeTicketDtoFromJson(
  Map<String, dynamic> json,
) => AdminRealtimeTicketDto(
  enabled: json['enabled'] as bool,
  ticket: json['ticket'],
  namespace: json['namespace'] as String,
  ttlSec: json['ttlSec'] as num,
);

Map<String, dynamic> _$AdminRealtimeTicketDtoToJson(
  AdminRealtimeTicketDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'ticket': ?instance.ticket,
  'namespace': instance.namespace,
  'ttlSec': instance.ttlSec,
};
