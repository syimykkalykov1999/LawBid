// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'broadcast_dto.g.dart';

@JsonSerializable()
class BroadcastDto {
  const BroadcastDto({
    required this.id,
    required this.title,
    required this.body,
    required this.audience,
    required this.recipients,
    required this.createdAt,
    this.stateCode,
  });

  factory BroadcastDto.fromJson(Map<String, Object?> json) =>
      _$BroadcastDtoFromJson(json);

  final String id;
  final String title;
  final String body;
  final String audience;
  final String? stateCode;
  final int recipients;
  final String createdAt;

  Map<String, Object?> toJson() => _$BroadcastDtoToJson(this);
}
