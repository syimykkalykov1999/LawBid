// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'translated_i18n_text_dto.dart';

part 'translated_i18n_text_envelope.g.dart';

@JsonSerializable()
class TranslatedI18nTextEnvelope {
  const TranslatedI18nTextEnvelope({
    required this.data,
    this.meta,
  });
  
  factory TranslatedI18nTextEnvelope.fromJson(Map<String, Object?> json) => _$TranslatedI18nTextEnvelopeFromJson(json);
  
  final TranslatedI18nTextDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TranslatedI18nTextEnvelopeToJson(this);
}
