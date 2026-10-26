// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_no_show_dto_absent_side.dart';
import 'admin_no_show_dto_source.dart';
import 'admin_no_show_dto_state.dart';

part 'admin_no_show_dto.g.dart';

@JsonSerializable()
class AdminNoShowDto {
  const AdminNoShowDto({
    required this.id,
    required this.consultationId,
    required this.absentSide,
    required this.absentUserId,
    required this.source,
    required this.state,
    required this.markedAt,
    this.markedById,
    this.disputeReason,
    this.resolutionNote,
  });

  factory AdminNoShowDto.fromJson(Map<String, Object?> json) =>
      _$AdminNoShowDtoFromJson(json);

  final String id;
  final String consultationId;
  final AdminNoShowDtoAbsentSide absentSide;
  final String absentUserId;
  final AdminNoShowDtoSource source;
  final String? markedById;
  final AdminNoShowDtoState state;
  final String markedAt;
  final String? disputeReason;
  final String? resolutionNote;

  Map<String, Object?> toJson() => _$AdminNoShowDtoToJson(this);
}
