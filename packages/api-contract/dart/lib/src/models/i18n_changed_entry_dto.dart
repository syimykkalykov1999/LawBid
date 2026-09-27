// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'i18n_changed_entry_dto.g.dart';

@JsonSerializable()
class I18nChangedEntryDto {
  const I18nChangedEntryDto({required this.key, required this.lang});

  factory I18nChangedEntryDto.fromJson(Map<String, Object?> json) =>
      _$I18nChangedEntryDtoFromJson(json);

  final String key;
  final String lang;

  Map<String, Object?> toJson() => _$I18nChangedEntryDtoToJson(this);
}
