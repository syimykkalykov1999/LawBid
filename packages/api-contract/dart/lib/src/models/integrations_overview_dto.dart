// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'integration_dto.dart';

part 'integrations_overview_dto.g.dart';

@JsonSerializable()
class IntegrationsOverviewDto {
  const IntegrationsOverviewDto({
    required this.storageEnabled,
    required this.items,
  });

  factory IntegrationsOverviewDto.fromJson(Map<String, Object?> json) =>
      _$IntegrationsOverviewDtoFromJson(json);

  /// False until SECRETS_MASTER_KEYS is set on the server (read-only view).
  final bool storageEnabled;
  final List<IntegrationDto> items;

  Map<String, Object?> toJson() => _$IntegrationsOverviewDtoToJson(this);
}
