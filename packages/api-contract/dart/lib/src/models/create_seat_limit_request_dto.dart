// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_seat_limit_request_dto.g.dart';

@JsonSerializable()
class CreateSeatLimitRequestDto {
  const CreateSeatLimitRequestDto({required this.seats, this.note});

  factory CreateSeatLimitRequestDto.fromJson(Map<String, Object?> json) =>
      _$CreateSeatLimitRequestDtoFromJson(json);

  final int seats;
  final String? note;

  Map<String, Object?> toJson() => _$CreateSeatLimitRequestDtoToJson(this);
}
