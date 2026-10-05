// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'template_download_dto.dart';

part 'template_download_envelope.g.dart';

@JsonSerializable()
class TemplateDownloadEnvelope {
  const TemplateDownloadEnvelope({required this.data, this.meta});

  factory TemplateDownloadEnvelope.fromJson(Map<String, Object?> json) =>
      _$TemplateDownloadEnvelopeFromJson(json);

  final TemplateDownloadDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TemplateDownloadEnvelopeToJson(this);
}
