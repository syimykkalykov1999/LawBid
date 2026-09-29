// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_flag_dto.g.dart';

@JsonSerializable()
class UpdateFlagDto {
  const UpdateFlagDto({this.enabled, this.rolloutPercent});

  factory UpdateFlagDto.fromJson(Map<String, Object?> json) =>
      _$UpdateFlagDtoFromJson(json);

  final bool? enabled;
  final int? rolloutPercent;

  Map<String, Object?> toJson() => _$UpdateFlagDtoToJson(this);
}
