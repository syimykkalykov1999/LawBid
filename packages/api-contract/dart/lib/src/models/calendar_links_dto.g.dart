// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calendar_links_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CalendarLinksDto _$CalendarLinksDtoFromJson(Map<String, dynamic> json) =>
    CalendarLinksDto(
      google: json['google'] as String,
      outlook: json['outlook'] as String,
      ics: json['ics'] as String?,
    );

Map<String, dynamic> _$CalendarLinksDtoToJson(CalendarLinksDto instance) =>
    <String, dynamic>{
      'google': instance.google,
      'outlook': instance.outlook,
      'ics': ?instance.ics,
    };
