// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_ticket_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportTicketDetailEnvelope _$AdminSupportTicketDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSupportTicketDetailEnvelope(
  data: AdminSupportTicketDetailDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSupportTicketDetailEnvelopeToJson(
  AdminSupportTicketDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
