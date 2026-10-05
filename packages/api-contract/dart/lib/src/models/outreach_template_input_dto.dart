// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_template_kind.dart';

part 'outreach_template_input_dto.g.dart';

@JsonSerializable()
class OutreachTemplateInputDto {
  const OutreachTemplateInputDto({
    required this.name,
    required this.subject,
    required this.body,
    this.kind = OutreachTemplateKind.any,
    this.active = true,
  });

  factory OutreachTemplateInputDto.fromJson(Map<String, Object?> json) =>
      _$OutreachTemplateInputDtoFromJson(json);

  final String name;
  final OutreachTemplateKind kind;
  final String subject;

  /// Plain text; {{first_name}} {{last_name}} {{company}} {{sender_name}} {{link}}.
  final String body;
  final bool active;

  Map<String, Object?> toJson() => _$OutreachTemplateInputDtoToJson(this);
}
