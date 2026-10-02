// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_ticket_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportTicketEnvelope _$SupportTicketEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportTicketEnvelope(
  data: SupportTicketDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportTicketEnvelopeToJson(
  SupportTicketEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
