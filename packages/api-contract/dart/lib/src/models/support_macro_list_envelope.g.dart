// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_macro_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportMacroListEnvelope _$SupportMacroListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportMacroListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SupportMacroDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportMacroListEnvelopeToJson(
  SupportMacroListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
