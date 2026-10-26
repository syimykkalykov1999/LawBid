// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_no_show_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminNoShowDto _$AdminNoShowDtoFromJson(Map<String, dynamic> json) =>
    AdminNoShowDto(
      id: json['id'] as String,
      consultationId: json['consultationId'] as String,
      absentSide: AdminNoShowDtoAbsentSide.fromJson(
        json['absentSide'] as String,
      ),
      absentUserId: json['absentUserId'] as String,
      source: AdminNoShowDtoSource.fromJson(json['source'] as String),
      state: AdminNoShowDtoState.fromJson(json['state'] as String),
      markedAt: json['markedAt'] as String,
      markedById: json['markedById'] as String?,
      disputeReason: json['disputeReason'] as String?,
      resolutionNote: json['resolutionNote'] as String?,
    );

Map<String, dynamic> _$AdminNoShowDtoToJson(AdminNoShowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'consultationId': instance.consultationId,
      'absentSide': instance.absentSide.toJson(),
      'absentUserId': instance.absentUserId,
      'source': instance.source.toJson(),
      'markedById': ?instance.markedById,
      'state': instance.state.toJson(),
      'markedAt': instance.markedAt,
      'disputeReason': ?instance.disputeReason,
      'resolutionNote': ?instance.resolutionNote,
    };
