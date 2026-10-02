// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_role_template_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRoleTemplateListEnvelope _$AdminRoleTemplateListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminRoleTemplateListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminRoleTemplateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminRoleTemplateListEnvelopeToJson(
  AdminRoleTemplateListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
