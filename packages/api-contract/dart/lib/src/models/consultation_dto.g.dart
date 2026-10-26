// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationDto _$ConsultationDtoFromJson(Map<String, dynamic> json) =>
    ConsultationDto(
      id: json['id'] as String,
      status: ConsultationDtoStatus.fromJson(json['status'] as String),
      startsAt: json['startsAt'] as String,
      endsAt: json['endsAt'] as String,
      viewerRole: ConsultationDtoViewerRole.fromJson(
        json['viewerRole'] as String,
      ),
      counterpart: ConsultationPersonDto.fromJson(
        json['counterpart'] as Map<String, dynamic>,
      ),
      attorneyTimezone: json['attorneyTimezone'] as String,
      canCall: json['canCall'] as bool,
      createdAt: json['createdAt'] as String,
      note: json['note'] as String?,
      caseId: json['caseId'] as String?,
      conversationId: json['conversationId'] as String?,
      cancelReason: json['cancelReason'] as String?,
      cancelledBy: json['cancelledBy'] == null
          ? null
          : ConsultationDtoCancelledBy.fromJson(json['cancelledBy'] as String),
      rescheduledAt: json['rescheduledAt'] as String?,
    );

Map<String, dynamic> _$ConsultationDtoToJson(ConsultationDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'startsAt': instance.startsAt,
      'endsAt': instance.endsAt,
      'viewerRole': instance.viewerRole.toJson(),
      'counterpart': instance.counterpart.toJson(),
      'attorneyTimezone': instance.attorneyTimezone,
      'note': ?instance.note,
      'caseId': ?instance.caseId,
      'conversationId': ?instance.conversationId,
      'cancelReason': ?instance.cancelReason,
      'cancelledBy': ?instance.cancelledBy?.toJson(),
      'rescheduledAt': ?instance.rescheduledAt,
      'canCall': instance.canCall,
      'createdAt': instance.createdAt,
    };
