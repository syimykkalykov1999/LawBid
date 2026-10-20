// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'message_dto.dart';

part 'pins_dto.g.dart';

@JsonSerializable()
class PinsDto {
  const PinsDto({required this.items});

  factory PinsDto.fromJson(Map<String, Object?> json) =>
      _$PinsDtoFromJson(json);

  final List<MessageDto> items;

  Map<String, Object?> toJson() => _$PinsDtoToJson(this);
}
