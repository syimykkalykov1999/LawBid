// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'custom_integration_created_dto.g.dart';

@JsonSerializable()
class CustomIntegrationCreatedDto {
  const CustomIntegrationCreatedDto({required this.provider});

  factory CustomIntegrationCreatedDto.fromJson(Map<String, Object?> json) =>
      _$CustomIntegrationCreatedDtoFromJson(json);

  final String provider;

  Map<String, Object?> toJson() => _$CustomIntegrationCreatedDtoToJson(this);
}
