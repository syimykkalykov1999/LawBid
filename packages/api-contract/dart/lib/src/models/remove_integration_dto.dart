// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'remove_integration_dto.g.dart';

@JsonSerializable()
class RemoveIntegrationDto {
  const RemoveIntegrationDto({required this.confirm, this.slot});

  factory RemoveIntegrationDto.fromJson(Map<String, Object?> json) =>
      _$RemoveIntegrationDtoFromJson(json);

  /// Type the provider id to confirm.
  final String confirm;

  /// Only this key set; every set when omitted.
  final String? slot;

  Map<String, Object?> toJson() => _$RemoveIntegrationDtoToJson(this);
}
