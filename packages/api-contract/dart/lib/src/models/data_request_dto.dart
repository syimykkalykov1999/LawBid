// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_request_dto_request_type.dart';
import 'data_request_dto_status.dart';

part 'data_request_dto.g.dart';

@JsonSerializable()
class DataRequestDto {
  const DataRequestDto({
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
  });

  factory DataRequestDto.fromJson(Map<String, Object?> json) =>
      _$DataRequestDtoFromJson(json);

  final String id;
  final DataRequestDtoRequestType requestType;
  final String referenceNumber;
  final String agency;
  final DateTime receivedAt;
  final String scope;
  final DataRequestDtoStatus status;
  final String handledBy;
  final String? notes;
  final DateTime? closedAt;
  final DateTime createdAt;
  final int accessCount;

  Map<String, Object?> toJson() => _$DataRequestDtoToJson(this);
}
