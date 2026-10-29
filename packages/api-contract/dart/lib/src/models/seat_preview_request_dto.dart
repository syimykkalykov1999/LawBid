// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'seat_preview_request_dto.g.dart';

@JsonSerializable()
class SeatPreviewRequestDto {
  const SeatPreviewRequestDto({
    required this.seats,
  });
  
  factory SeatPreviewRequestDto.fromJson(Map<String, Object?> json) => _$SeatPreviewRequestDtoFromJson(json);
  
  /// The wanted EXTRA seats (on top of the plan's included).
  final int seats;

  Map<String, Object?> toJson() => _$SeatPreviewRequestDtoToJson(this);
}
