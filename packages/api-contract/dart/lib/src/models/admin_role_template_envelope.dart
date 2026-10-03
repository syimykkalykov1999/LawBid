// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_role_template_dto.dart';
import 'response_meta_dto.dart';

part 'admin_role_template_envelope.g.dart';

@JsonSerializable()
class AdminRoleTemplateEnvelope {
  const AdminRoleTemplateEnvelope({required this.data, this.meta});

  factory AdminRoleTemplateEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminRoleTemplateEnvelopeFromJson(json);

  final AdminRoleTemplateDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminRoleTemplateEnvelopeToJson(this);
}
