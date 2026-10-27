// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auto_action_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoActionListEnvelope _$AutoActionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AutoActionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AutoActionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AutoActionListEnvelopeToJson(
  AutoActionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
