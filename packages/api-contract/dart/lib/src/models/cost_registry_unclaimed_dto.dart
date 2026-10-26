// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cost_registry_unclaimed_dto.g.dart';

@JsonSerializable()
class CostRegistryUnclaimedDto {
  const CostRegistryUnclaimedDto({required this.service, required this.usd});

  factory CostRegistryUnclaimedDto.fromJson(Map<String, Object?> json) =>
      _$CostRegistryUnclaimedDtoFromJson(json);

  final String service;
  final num usd;

  Map<String, Object?> toJson() => _$CostRegistryUnclaimedDtoToJson(this);
}
