// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'i18n_bundle_dto.g.dart';

@JsonSerializable()
class I18nBundleDto {
  const I18nBundleDto({
    required this.lang,
    required this.version,
    required this.translations,
  });

  factory I18nBundleDto.fromJson(Map<String, Object?> json) =>
      _$I18nBundleDtoFromJson(json);

  final String lang;

  /// Current bundle version; send it back as `since`.
  final int version;

  /// key -> text. Full bundle without `since`; only keys changed after `since` with it (empty when up to date).
  final Map<String, String> translations;

  Map<String, Object?> toJson() => _$I18nBundleDtoToJson(this);
}
