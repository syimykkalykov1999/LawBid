// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integrations_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationsOverviewDto _$IntegrationsOverviewDtoFromJson(
  Map<String, dynamic> json,
) => IntegrationsOverviewDto(
  storageEnabled: json['storageEnabled'] as bool,
  items: (json['items'] as List<dynamic>)
      .map((e) => IntegrationDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$IntegrationsOverviewDtoToJson(
  IntegrationsOverviewDto instance,
) => <String, dynamic>{
  'storageEnabled': instance.storageEnabled,
  'items': instance.items.map((e) => e.toJson()).toList(),
};
