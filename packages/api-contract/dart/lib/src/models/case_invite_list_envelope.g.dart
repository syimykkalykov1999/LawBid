// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_invite_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseInviteListEnvelope _$CaseInviteListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseInviteListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseInviteDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseInviteListEnvelopeToJson(
  CaseInviteListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
