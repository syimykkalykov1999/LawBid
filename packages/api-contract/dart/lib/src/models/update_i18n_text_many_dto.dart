// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_i18n_text_many_dto.g.dart';

@JsonSerializable()
class UpdateI18nTextManyDto {
  const UpdateI18nTextManyDto({
    required this.key,
    required this.values,
  });
  
  factory UpdateI18nTextManyDto.fromJson(Map<String, Object?> json) => _$UpdateI18nTextManyDtoFromJson(json);
  
  final String key;
  final Map<String, String> values;

  Map<String, Object?> toJson() => _$UpdateI18nTextManyDtoToJson(this);
}
