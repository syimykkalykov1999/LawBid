// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'email_template_summary_dto.dart';
import 'response_meta_dto.dart';

part 'email_template_summary_list_envelope.g.dart';

@JsonSerializable()
class EmailTemplateSummaryListEnvelope {
  const EmailTemplateSummaryListEnvelope({required this.data, this.meta});

  factory EmailTemplateSummaryListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$EmailTemplateSummaryListEnvelopeFromJson(json);

  final List<EmailTemplateSummaryDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$EmailTemplateSummaryListEnvelopeToJson(this);
}
