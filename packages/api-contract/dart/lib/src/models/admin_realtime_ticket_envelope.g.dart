// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_realtime_ticket_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRealtimeTicketEnvelope _$AdminRealtimeTicketEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminRealtimeTicketEnvelope(
  data: AdminRealtimeTicketDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminRealtimeTicketEnvelopeToJson(
  AdminRealtimeTicketEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
