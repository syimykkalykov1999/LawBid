// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'email_template_preview_dto.dart';
import 'response_meta_dto.dart';

part 'email_template_preview_envelope.g.dart';

@JsonSerializable()
class EmailTemplatePreviewEnvelope {
  const EmailTemplatePreviewEnvelope({required this.data, this.meta});

  factory EmailTemplatePreviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$EmailTemplatePreviewEnvelopeFromJson(json);

  final EmailTemplatePreviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$EmailTemplatePreviewEnvelopeToJson(this);
}
