// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_gift_shown_dto.g.dart';

@JsonSerializable()
class SetGiftShownDto {
  const SetGiftShownDto({required this.shown});

  factory SetGiftShownDto.fromJson(Map<String, Object?> json) =>
      _$SetGiftShownDtoFromJson(json);

  final bool shown;

  Map<String, Object?> toJson() => _$SetGiftShownDtoToJson(this);
}
