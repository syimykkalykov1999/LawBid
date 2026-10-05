// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_next_ticket_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportNextTicketEnvelope _$SupportNextTicketEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportNextTicketEnvelope(
  data: SupportNextTicketDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportNextTicketEnvelopeToJson(
  SupportNextTicketEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
