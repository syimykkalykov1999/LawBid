// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_line_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineLineViewDto _$HotlineLineViewDtoFromJson(Map<String, dynamic> json) =>
    HotlineLineViewDto(
      online: json['online'] as bool,
      state: HotlineLineState.fromJson(json['state'] as String),
      accepting: json['accepting'] as bool,
      states: (json['states'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      practiceAreas: (json['practiceAreas'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      heartbeatSec: json['heartbeatSec'] as num,
      offerTimeoutSec: json['offerTimeoutSec'] as num,
      via: json['via'] == null
          ? null
          : HotlineAccessVia.fromJson(json['via'] as String),
    );

Map<String, dynamic> _$HotlineLineViewDtoToJson(HotlineLineViewDto instance) =>
    <String, dynamic>{
      'online': instance.online,
      'state': instance.state.toJson(),
      'accepting': instance.accepting,
      'states': instance.states,
      'practiceAreas': instance.practiceAreas,
      'languages': instance.languages,
      'heartbeatSec': instance.heartbeatSec,
      'offerTimeoutSec': instance.offerTimeoutSec,
      'via': ?instance.via?.toJson(),
    };
