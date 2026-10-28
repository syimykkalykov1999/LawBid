// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calls_path_breakers_dto.dart';
import 'calls_path_dto_carrying.dart';
import 'calls_path_dto_transport.dart';
import 'calls_path_side_dto.dart';

part 'calls_path_dto.g.dart';

@JsonSerializable()
class CallsPathDto {
  const CallsPathDto({
    required this.transport,
    required this.carrying,
    required this.breakers,
    required this.cloudflare,
    required this.own,
  });

  factory CallsPathDto.fromJson(Map<String, Object?> json) =>
      _$CallsPathDtoFromJson(json);

  final CallsPathDtoTransport transport;

  /// Who carries NEW calls right now.
  final CallsPathDtoCarrying carrying;
  final CallsPathBreakersDto breakers;
  final CallsPathSideDto cloudflare;
  final CallsPathSideDto own;

  Map<String, Object?> toJson() => _$CallsPathDtoToJson(this);
}
