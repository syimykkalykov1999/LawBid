// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'activate_integration_dto.g.dart';

@JsonSerializable()
class ActivateIntegrationDto {
  const ActivateIntegrationDto({this.force});

  factory ActivateIntegrationDto.fromJson(Map<String, Object?> json) =>
      _$ActivateIntegrationDtoFromJson(json);

  /// Activate without a passed test (not recommended).
  final bool? force;

  Map<String, Object?> toJson() => _$ActivateIntegrationDtoToJson(this);
}
