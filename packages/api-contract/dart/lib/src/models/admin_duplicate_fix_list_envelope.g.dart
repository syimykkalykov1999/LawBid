// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_duplicate_fix_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDuplicateFixListEnvelope _$AdminDuplicateFixListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDuplicateFixListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminDuplicateFixDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDuplicateFixListEnvelopeToJson(
  AdminDuplicateFixListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
