// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bootstrap_legal_document_dto.dart';
import 'i18n_language_dto.dart';

part 'bootstrap_dto.g.dart';

@JsonSerializable()
class BootstrapDto {
  const BootstrapDto({
    required this.flags,
    required this.appConfig,
    required this.languages,
    required this.translationsVersion,
    required this.legalDocuments,
  });

  factory BootstrapDto.fromJson(Map<String, Object?> json) =>
      _$BootstrapDtoFromJson(json);

  /// Feature flags by key (docs/01 §10.6).
  final Map<String, bool> flags;

  /// Public app_config values (min versions, store URLs, ...).
  @JsonKey(name: 'app_config')
  final dynamic appConfig;
  final List<I18nLanguageDto> languages;

  /// Current bundle version per language code.
  @JsonKey(name: 'translations_version')
  final Map<String, int> translationsVersion;
  @JsonKey(name: 'legal_documents')
  final List<BootstrapLegalDocumentDto> legalDocuments;

  Map<String, Object?> toJson() => _$BootstrapDtoToJson(this);
}
