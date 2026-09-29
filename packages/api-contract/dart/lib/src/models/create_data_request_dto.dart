// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_data_request_dto_request_type.dart';

part 'create_data_request_dto.g.dart';

@JsonSerializable()
class CreateDataRequestDto {
  const CreateDataRequestDto({
    required this.requestType,
    required this.referenceNumber,
    required this.agency,
    required this.receivedAt,
    required this.scope,
    this.notes,
  });

  factory CreateDataRequestDto.fromJson(Map<String, Object?> json) =>
      _$CreateDataRequestDtoFromJson(json);

  final CreateDataRequestDtoRequestType requestType;
  final String referenceNumber;

  /// Issuing agency / court.
  final String agency;
  final DateTime receivedAt;

  /// The scope as written in the request.
  final String scope;
  final String? notes;

  Map<String, Object?> toJson() => _$CreateDataRequestDtoToJson(this);
}
