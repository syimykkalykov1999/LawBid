// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_seats_dto.g.dart';

@JsonSerializable()
class SetSeatsDto {
  const SetSeatsDto({required this.seats});

  factory SetSeatsDto.fromJson(Map<String, Object?> json) =>
      _$SetSeatsDtoFromJson(json);

  final int seats;

  Map<String, Object?> toJson() => _$SetSeatsDtoToJson(this);
}
