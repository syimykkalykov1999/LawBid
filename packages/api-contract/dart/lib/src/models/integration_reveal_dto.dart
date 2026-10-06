// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'integration_reveal_dto.g.dart';

@JsonSerializable()
class IntegrationRevealDto {
  const IntegrationRevealDto({required this.version, required this.values});

  factory IntegrationRevealDto.fromJson(Map<String, Object?> json) =>
      _$IntegrationRevealDtoFromJson(json);

  final num version;
  final Map<String, String> values;

  Map<String, Object?> toJson() => _$IntegrationRevealDtoToJson(this);
}
