// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'test_state_registry_dto.g.dart';

@JsonSerializable()
class TestStateRegistryDto {
  const TestStateRegistryDto({
    required this.barNumber,
    this.firstName,
    this.lastName,
  });

  factory TestStateRegistryDto.fromJson(Map<String, Object?> json) =>
      _$TestStateRegistryDtoFromJson(json);

  final String barNumber;
  final String? firstName;
  final String? lastName;

  Map<String, Object?> toJson() => _$TestStateRegistryDtoToJson(this);
}
