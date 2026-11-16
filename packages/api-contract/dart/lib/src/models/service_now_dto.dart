// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'service_now_dto_kind.dart';

part 'service_now_dto.g.dart';

@JsonSerializable()
class ServiceNowDto {
  const ServiceNowDto({
    required this.kind,
    required this.running,
    required this.desired,
    required this.spot,
  });

  factory ServiceNowDto.fromJson(Map<String, Object?> json) =>
      _$ServiceNowDtoFromJson(json);

  final ServiceNowDtoKind kind;
  final num running;
  final num desired;

  /// Runs on Fargate Spot (null = the service does not say).
  final bool? spot;

  Map<String, Object?> toJson() => _$ServiceNowDtoToJson(this);
}
