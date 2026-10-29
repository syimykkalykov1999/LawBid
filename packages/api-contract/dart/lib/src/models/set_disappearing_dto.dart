// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_disappearing_dto_after_s.dart';

part 'set_disappearing_dto.g.dart';

@JsonSerializable()
class SetDisappearingDto {
  const SetDisappearingDto({
    this.afterS,
  });
  
  factory SetDisappearingDto.fromJson(Map<String, Object?> json) => _$SetDisappearingDtoFromJson(json);
  
  /// Seconds a new message lives: 86400 (24 h), 604800 (7 d) or 7776000 (90 d); absent or null = off.
  final SetDisappearingDtoAfterS? afterS;

  Map<String, Object?> toJson() => _$SetDisappearingDtoToJson(this);
}
