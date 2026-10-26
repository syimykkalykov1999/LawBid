// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'time_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TimeEntryDto _$TimeEntryDtoFromJson(Map<String, dynamic> json) => TimeEntryDto(
  id: json['id'] as String,
  workedOn: DateTime.parse(json['workedOn'] as String),
  minutes: json['minutes'] as num,
  runningSince: json['runningSince'] == null
      ? null
      : DateTime.parse(json['runningSince'] as String),
  note: json['note'] as String,
  rateCents: json['rateCents'] as num,
  cents: json['cents'] as num,
  invoiceId: json['invoiceId'] as String?,
);

Map<String, dynamic> _$TimeEntryDtoToJson(TimeEntryDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'workedOn': instance.workedOn.toIso8601String(),
      'minutes': instance.minutes,
      'runningSince': ?instance.runningSince?.toIso8601String(),
      'note': instance.note,
      'rateCents': instance.rateCents,
      'cents': instance.cents,
      'invoiceId': ?instance.invoiceId,
    };
