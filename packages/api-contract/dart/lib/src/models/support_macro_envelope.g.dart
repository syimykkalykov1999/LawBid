// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_macro_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportMacroEnvelope _$SupportMacroEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportMacroEnvelope(
  data: SupportMacroDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportMacroEnvelopeToJson(
  SupportMacroEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
