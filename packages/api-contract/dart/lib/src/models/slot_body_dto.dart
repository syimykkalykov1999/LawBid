// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'slot_body_dto.g.dart';

@JsonSerializable()
class SlotBodyDto {
  const SlotBodyDto({this.slot});

  factory SlotBodyDto.fromJson(Map<String, Object?> json) =>
      _$SlotBodyDtoFromJson(json);

  /// Key set; "main" when omitted.
  final String? slot;

  Map<String, Object?> toJson() => _$SlotBodyDtoToJson(this);
}
