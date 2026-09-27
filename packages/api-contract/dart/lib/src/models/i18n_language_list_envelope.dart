// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'i18n_language_dto.dart';
import 'response_meta_dto.dart';

part 'i18n_language_list_envelope.g.dart';

@JsonSerializable()
class I18nLanguageListEnvelope {
  const I18nLanguageListEnvelope({required this.data, this.meta});

  factory I18nLanguageListEnvelope.fromJson(Map<String, Object?> json) =>
      _$I18nLanguageListEnvelopeFromJson(json);

  final List<I18nLanguageDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$I18nLanguageListEnvelopeToJson(this);
}
