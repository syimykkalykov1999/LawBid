// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_ticket_row_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportTicketRowEnvelope _$AdminSupportTicketRowEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSupportTicketRowEnvelope(
  data: AdminSupportTicketRowDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSupportTicketRowEnvelopeToJson(
  AdminSupportTicketRowEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
