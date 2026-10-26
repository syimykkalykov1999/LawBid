// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_channel_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminChannelEnvelope _$AdminChannelEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminChannelEnvelope(
  data: AdminChannelDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminChannelEnvelopeToJson(
  AdminChannelEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
