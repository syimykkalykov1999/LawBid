// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_message_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportMessageEnvelope _$AdminSupportMessageEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSupportMessageEnvelope(
  data: AdminSupportMessageDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSupportMessageEnvelopeToJson(
  AdminSupportMessageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
