// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_providers_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarProvidersDto _$CalendarProvidersDtoFromJson(
  Map<String, dynamic> json,
) => CalendarProvidersDto(
  googleEnabled: json['googleEnabled'] as bool,
  microsoftEnabled: json['microsoftEnabled'] as bool,
  connections: (json['connections'] as List<dynamic>)
      .map((e) => CalendarConnectionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CalendarProvidersDtoToJson(
  CalendarProvidersDto instance,
) => <String, dynamic>{
  'googleEnabled': instance.googleEnabled,
  'microsoftEnabled': instance.microsoftEnabled,
  'connections': instance.connections.map((e) => e.toJson()).toList(),
};
