// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_access_log_entry_dto.dart';
import 'data_request_card_dto_request_type.dart';
import 'data_request_card_dto_status.dart';

part 'data_request_card_dto.g.dart';

@JsonSerializable()
class DataRequestCardDto {
  const DataRequestCardDto({
    required this.id,
    required this.requestType,
    required this.referenceNumber,
    required this.agency,
    required this.receivedAt,
    required this.scope,
    required this.status,
    required this.handledBy,
    required this.notes,
    required this.closedAt,
    required this.createdAt,
    required this.accessCount,
    required this.accessLog,
  });

  factory DataRequestCardDto.fromJson(Map<String, Object?> json) =>
      _$DataRequestCardDtoFromJson(json);

  final String id;
  final DataRequestCardDtoRequestType requestType;
  final String referenceNumber;
  final String agency;
  final DateTime receivedAt;
  final String scope;
  final DataRequestCardDtoStatus status;
  final String handledBy;
  final String? notes;
  final DateTime? closedAt;
  final DateTime createdAt;
  final int accessCount;
  final List<DataAccessLogEntryDto> accessLog;

  Map<String, Object?> toJson() => _$DataRequestCardDtoToJson(this);
}
