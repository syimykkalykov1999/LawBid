// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'blocked_user_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BlockedUserListEnvelope _$BlockedUserListEnvelopeFromJson(
  Map<String, dynamic> json,
) => BlockedUserListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => BlockedUserDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BlockedUserListEnvelopeToJson(
  BlockedUserListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
