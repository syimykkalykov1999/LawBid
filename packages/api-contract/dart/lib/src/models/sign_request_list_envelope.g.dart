// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_request_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignRequestListEnvelope _$SignRequestListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SignRequestListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SignRequestDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SignRequestListEnvelopeToJson(
  SignRequestListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
