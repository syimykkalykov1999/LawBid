// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyListEnvelope _$PasskeyListEnvelopeFromJson(Map<String, dynamic> json) =>
    PasskeyListEnvelope(
      data: PasskeyListDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PasskeyListEnvelopeToJson(
  PasskeyListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
