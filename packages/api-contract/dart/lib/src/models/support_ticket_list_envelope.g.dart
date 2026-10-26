// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_ticket_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportTicketListEnvelope _$SupportTicketListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportTicketListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SupportTicketDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportTicketListEnvelopeToJson(
  SupportTicketListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
