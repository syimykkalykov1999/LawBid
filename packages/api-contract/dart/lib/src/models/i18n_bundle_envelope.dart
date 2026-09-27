// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'i18n_bundle_dto.dart';
import 'response_meta_dto.dart';

part 'i18n_bundle_envelope.g.dart';

@JsonSerializable()
class I18nBundleEnvelope {
  const I18nBundleEnvelope({required this.data, this.meta});

  factory I18nBundleEnvelope.fromJson(Map<String, Object?> json) =>
      _$I18nBundleEnvelopeFromJson(json);

  final I18nBundleDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$I18nBundleEnvelopeToJson(this);
}
