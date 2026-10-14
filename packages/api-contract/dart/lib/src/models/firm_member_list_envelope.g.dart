// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'firm_member_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FirmMemberListEnvelope _$FirmMemberListEnvelopeFromJson(
  Map<String, dynamic> json,
) => FirmMemberListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => FirmMemberDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FirmMemberListEnvelopeToJson(
  FirmMemberListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
