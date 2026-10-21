// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'username_check_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsernameCheckEnvelope _$UsernameCheckEnvelopeFromJson(
  Map<String, dynamic> json,
) => UsernameCheckEnvelope(
  data: UsernameCheckDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$UsernameCheckEnvelopeToJson(
  UsernameCheckEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
