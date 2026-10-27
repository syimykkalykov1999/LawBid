// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_no_show_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminNoShowListEnvelope _$AdminNoShowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminNoShowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminNoShowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminNoShowListEnvelopeToJson(
  AdminNoShowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
