// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'email_template_detail_dto.dart';
import 'response_meta_dto.dart';

part 'email_template_detail_envelope.g.dart';

@JsonSerializable()
class EmailTemplateDetailEnvelope {
  const EmailTemplateDetailEnvelope({required this.data, this.meta});

  factory EmailTemplateDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateDetailEnvelopeFromJson(json);

  final EmailTemplateDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$EmailTemplateDetailEnvelopeToJson(this);
}
