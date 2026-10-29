// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'message_dto.dart';

part 'pins_dto.g.dart';

@JsonSerializable()
class PinsDto {
  const PinsDto({
    required this.items,
    required this.editWindowMin,
    required this.deleteForAllHours,
    required this.maxPins,
  });
  
  factory PinsDto.fromJson(Map<String, Object?> json) => _$PinsDtoFromJson(json);
  
  final List<MessageDto> items;

  /// Minutes a text message can be edited.
  final num editWindowMin;

  /// Hours a message can be deleted for everyone.
  final num deleteForAllHours;

  /// Pins allowed per chat.
  final num maxPins;

  Map<String, Object?> toJson() => _$PinsDtoToJson(this);
}
