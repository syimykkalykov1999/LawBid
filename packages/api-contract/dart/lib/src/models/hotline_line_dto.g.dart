// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_line_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineLineDto _$HotlineLineDtoFromJson(Map<String, dynamic> json) =>
    HotlineLineDto(
      states: (json['states'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      practiceAreas: (json['practiceAreas'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      accepting: json['accepting'] as bool? ?? true,
    );

Map<String, dynamic> _$HotlineLineDtoToJson(HotlineLineDto instance) =>
    <String, dynamic>{
      'states': instance.states,
      'practiceAreas': instance.practiceAreas,
      'languages': instance.languages,
      'accepting': instance.accepting,
    };
