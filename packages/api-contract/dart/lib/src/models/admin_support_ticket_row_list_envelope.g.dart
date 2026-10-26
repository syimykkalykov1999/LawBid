// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_ticket_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportTicketRowListEnvelope _$AdminSupportTicketRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSupportTicketRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminSupportTicketRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSupportTicketRowListEnvelopeToJson(
  AdminSupportTicketRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
