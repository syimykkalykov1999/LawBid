// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_template_kind.dart';

part 'outreach_template_dto.g.dart';

@JsonSerializable()
class OutreachTemplateDto {
  const OutreachTemplateDto({
    required this.id,
    required this.name,
    required this.kind,
    required this.subject,
    required this.body,
    required this.active,
    required this.updatedAt,
  });

  factory OutreachTemplateDto.fromJson(Map<String, Object?> json) =>
      _$OutreachTemplateDtoFromJson(json);

  final String id;
  final String name;
  final OutreachTemplateKind kind;
  final String subject;
  final String body;
  final bool active;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$OutreachTemplateDtoToJson(this);
}
