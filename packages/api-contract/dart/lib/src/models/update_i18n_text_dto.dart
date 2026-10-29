// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_i18n_text_dto.g.dart';

@JsonSerializable()
class UpdateI18nTextDto {
  const UpdateI18nTextDto({
    required this.key,
    required this.lang,
    required this.value,
  });
  
  factory UpdateI18nTextDto.fromJson(Map<String, Object?> json) => _$UpdateI18nTextDtoFromJson(json);
  
  final String key;
  final String lang;
  final String value;

  Map<String, Object?> toJson() => _$UpdateI18nTextDtoToJson(this);
}
