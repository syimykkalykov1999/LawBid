// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_golden_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewGoldenRowDto _$ReviewGoldenRowDtoFromJson(Map<String, dynamic> json) =>
    ReviewGoldenRowDto(
      id: json['id'] as String,
      decisionKind: json['decisionKind'] as String,
      state: StaffGoldenState.fromJson(json['state'] as String),
      worker: ReviewPersonRefDto.fromJson(
        json['worker'] as Map<String, dynamic>,
      ),
      createdAt: DateTime.parse(json['createdAt'] as String),
      doneAt: json['doneAt'] == null
          ? null
          : DateTime.parse(json['doneAt'] as String),
    );

Map<String, dynamic> _$ReviewGoldenRowDtoToJson(ReviewGoldenRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'decisionKind': instance.decisionKind,
      'state': instance.state.toJson(),
      'worker': instance.worker.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
      'doneAt': ?instance.doneAt?.toIso8601String(),
    };
