// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'broadcast_audience.dart';

part 'create_broadcast_dto.g.dart';

@JsonSerializable()
class CreateBroadcastDto {
  const CreateBroadcastDto({
    required this.title,
    required this.body,
    required this.audience,
    this.stateCode,
  });

  factory CreateBroadcastDto.fromJson(Map<String, Object?> json) =>
      _$CreateBroadcastDtoFromJson(json);

  final String title;
  final String body;
  final BroadcastAudience audience;

  /// Only this state.
  final String? stateCode;

  Map<String, Object?> toJson() => _$CreateBroadcastDtoToJson(this);
}
