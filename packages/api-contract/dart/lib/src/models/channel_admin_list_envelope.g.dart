// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_admin_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelAdminListEnvelope _$ChannelAdminListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ChannelAdminListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ChannelAdminDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChannelAdminListEnvelopeToJson(
  ChannelAdminListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
