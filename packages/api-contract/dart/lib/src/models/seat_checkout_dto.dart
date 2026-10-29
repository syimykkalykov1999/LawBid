// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'seat_checkout_dto.g.dart';

@JsonSerializable()
class SeatCheckoutDto {
  const SeatCheckoutDto({
    required this.url,
    required this.sessionId,
  });
  
  factory SeatCheckoutDto.fromJson(Map<String, Object?> json) => _$SeatCheckoutDtoFromJson(json);
  
  /// One-time link to the card page; open it in the browser, then re-read GET /subscriptions/me.
  final String url;
  final String sessionId;

  Map<String, Object?> toJson() => _$SeatCheckoutDtoToJson(this);
}
