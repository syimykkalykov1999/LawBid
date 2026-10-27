// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_setting_dto_type.dart';

part 'promotion_setting_dto.g.dart';

@JsonSerializable()
class PromotionSettingDto {
  const PromotionSettingDto({
    required this.key,
    required this.type,
    required this.value,
    required this.stored,
    required this.defaultValue,
  });

  factory PromotionSettingDto.fromJson(Map<String, Object?> json) =>
      _$PromotionSettingDtoFromJson(json);

  /// app_config key, always `seo.*`.
  final String key;
  final PromotionSettingDtoType type;

  /// Stored value, or the default while nothing is stored.
  final dynamic value;

  /// False = the admin never decided: the repository variable of the same name still applies.
  final bool stored;
  final dynamic defaultValue;

  Map<String, Object?> toJson() => _$PromotionSettingDtoToJson(this);
}
