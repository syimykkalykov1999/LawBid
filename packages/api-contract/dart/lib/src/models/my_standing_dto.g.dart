// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_standing_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyStandingDto _$MyStandingDtoFromJson(Map<String, dynamic> json) =>
    MyStandingDto(
      strikes: StrikeStandingDto.fromJson(
        json['strikes'] as Map<String, dynamic>,
      ),
      reporting: ReportingStatusDto.fromJson(
        json['reporting'] as Map<String, dynamic>,
      ),
      autoActions: (json['autoActions'] as List<dynamic>)
          .map((e) => AutoActionDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$MyStandingDtoToJson(MyStandingDto instance) =>
    <String, dynamic>{
      'strikes': instance.strikes.toJson(),
      'reporting': instance.reporting.toJson(),
      'autoActions': instance.autoActions.map((e) => e.toJson()).toList(),
    };
