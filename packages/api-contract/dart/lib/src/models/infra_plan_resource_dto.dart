// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'infra_plan_resource_dto.g.dart';

@JsonSerializable()
class InfraPlanResourceDto {
  const InfraPlanResourceDto({required this.address, required this.action});

  factory InfraPlanResourceDto.fromJson(Map<String, Object?> json) =>
      _$InfraPlanResourceDtoFromJson(json);

  final String address;

  /// create, update, delete, delete-create, …
  final String action;

  Map<String, Object?> toJson() => _$InfraPlanResourceDtoToJson(this);
}
