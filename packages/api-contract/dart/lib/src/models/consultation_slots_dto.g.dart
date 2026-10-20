// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_slots_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationSlotsDto _$ConsultationSlotsDtoFromJson(
  Map<String, dynamic> json,
) => ConsultationSlotsDto(
  attorneyId: json['attorneyId'] as String,
  timezone: json['timezone'] as String,
  slotMinutes: (json['slotMinutes'] as num).toInt(),
  autoConfirm: json['autoConfirm'] as bool,
  from: json['from'] as String,
  days: (json['days'] as num).toInt(),
  slots: (json['slots'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$ConsultationSlotsDtoToJson(
  ConsultationSlotsDto instance,
) => <String, dynamic>{
  'attorneyId': instance.attorneyId,
  'timezone': instance.timezone,
  'slotMinutes': instance.slotMinutes,
  'autoConfirm': instance.autoConfirm,
  'from': instance.from,
  'days': instance.days,
  'slots': instance.slots,
};
