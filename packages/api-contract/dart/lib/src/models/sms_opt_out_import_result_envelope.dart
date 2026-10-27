// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sms_opt_out_import_result_dto.dart';

part 'sms_opt_out_import_result_envelope.g.dart';

@JsonSerializable()
class SmsOptOutImportResultEnvelope {
  const SmsOptOutImportResultEnvelope({required this.data, this.meta});

  factory SmsOptOutImportResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$SmsOptOutImportResultEnvelopeFromJson(json);

  final SmsOptOutImportResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SmsOptOutImportResultEnvelopeToJson(this);
}
