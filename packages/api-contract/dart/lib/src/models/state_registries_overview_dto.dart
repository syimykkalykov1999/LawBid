// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_adapter_descriptor_dto.dart';
import 'state_registry_dto.dart';

part 'state_registries_overview_dto.g.dart';

@JsonSerializable()
class StateRegistriesOverviewDto {
  const StateRegistriesOverviewDto({
    required this.secretsEnabled,
    required this.adapterTypes,
    required this.items,
  });

  factory StateRegistriesOverviewDto.fromJson(Map<String, Object?> json) =>
      _$StateRegistriesOverviewDtoFromJson(json);

  /// The server can store keys (master key set).
  final bool secretsEnabled;
  final List<RegistryAdapterDescriptorDto> adapterTypes;
  final List<StateRegistryDto> items;

  Map<String, Object?> toJson() => _$StateRegistriesOverviewDtoToJson(this);
}
