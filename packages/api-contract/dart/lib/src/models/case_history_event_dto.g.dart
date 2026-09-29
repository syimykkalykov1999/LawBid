// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_history_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseHistoryEventDto _$CaseHistoryEventDtoFromJson(Map<String, dynamic> json) =>
    CaseHistoryEventDto(
      id: json['id'] as String,
      eventType: json['eventType'] as String,
      createdAt: json['createdAt'] as String,
      actorRole: CaseHistoryEventDtoActorRole.fromJson(
        json['actorRole'] as String,
      ),
      amountCents: (json['amountCents'] as num?)?.toInt(),
      feeType: json['feeType'] == null
          ? null
          : FeeType.fromJson(json['feeType'] as String),
      roundNo: (json['roundNo'] as num?)?.toInt(),
      reason: json['reason'] as String?,
    );

Map<String, dynamic> _$CaseHistoryEventDtoToJson(
  CaseHistoryEventDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'eventType': instance.eventType,
  'createdAt': instance.createdAt,
  'actorRole': instance.actorRole.toJson(),
  'amountCents': ?instance.amountCents,
  'feeType': ?instance.feeType?.toJson(),
  'roundNo': ?instance.roundNo,
  'reason': ?instance.reason,
};
