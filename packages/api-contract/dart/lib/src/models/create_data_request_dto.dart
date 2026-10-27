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
    this.legalBasis,
    this.country,
    this.subjectUserId,
    this.dueAt,
    this.doNotNotify,
    this.nondisclosureUntil,
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

  /// The law the request rests on, e.g. "18 U.S.C. 2703(d)".
  final String? legalBasis;

  /// Two-letter country of the authority.
  final String? country;

  /// The person it concerns.
  final String? subjectUserId;

  /// Answer due.
  final DateTime? dueAt;

  /// Gag / non-disclosure order: do not tell the user.
  final bool? doNotNotify;

  /// The gag order ends (reminder to notify the user).
  final DateTime? nondisclosureUntil;

  Map<String, Object?> toJson() => _$CreateDataRequestDtoToJson(this);
}
