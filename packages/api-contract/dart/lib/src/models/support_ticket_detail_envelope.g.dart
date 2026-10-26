// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_ticket_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportTicketDetailEnvelope _$SupportTicketDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportTicketDetailEnvelope(
  data: SupportTicketDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportTicketDetailEnvelopeToJson(
  SupportTicketDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
