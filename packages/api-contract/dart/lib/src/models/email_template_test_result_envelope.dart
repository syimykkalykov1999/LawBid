// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'email_template_test_result_dto.dart';
import 'response_meta_dto.dart';

part 'email_template_test_result_envelope.g.dart';

@JsonSerializable()
class EmailTemplateTestResultEnvelope {
  const EmailTemplateTestResultEnvelope({required this.data, this.meta});

  factory EmailTemplateTestResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateTestResultEnvelopeFromJson(json);

  final EmailTemplateTestResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$EmailTemplateTestResultEnvelopeToJson(this);
}
