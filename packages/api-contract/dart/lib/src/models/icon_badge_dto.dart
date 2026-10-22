// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'icon_badge_dto.g.dart';

@JsonSerializable()
class IconBadgeDto {
  const IconBadgeDto({required this.enabled});

  factory IconBadgeDto.fromJson(Map<String, Object?> json) =>
      _$IconBadgeDtoFromJson(json);

  final bool enabled;

  Map<String, Object?> toJson() => _$IconBadgeDtoToJson(this);
}
