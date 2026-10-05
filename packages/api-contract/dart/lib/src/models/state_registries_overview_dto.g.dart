// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'state_registries_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StateRegistriesOverviewDto _$StateRegistriesOverviewDtoFromJson(
  Map<String, dynamic> json,
) => StateRegistriesOverviewDto(
  secretsEnabled: json['secretsEnabled'] as bool,
  adapterTypes: (json['adapterTypes'] as List<dynamic>)
      .map(
        (e) => RegistryAdapterDescriptorDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  items: (json['items'] as List<dynamic>)
      .map((e) => StateRegistryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$StateRegistriesOverviewDtoToJson(
  StateRegistriesOverviewDto instance,
) => <String, dynamic>{
  'secretsEnabled': instance.secretsEnabled,
  'adapterTypes': instance.adapterTypes.map((e) => e.toJson()).toList(),
  'items': instance.items.map((e) => e.toJson()).toList(),
};
