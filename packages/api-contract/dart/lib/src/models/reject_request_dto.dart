// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reject_request_dto_rejection_code.dart';

part 'reject_request_dto.g.dart';

@JsonSerializable()
class RejectRequestDto {
  const RejectRequestDto({required this.rejectionCode, this.comment});

  factory RejectRequestDto.fromJson(Map<String, Object?> json) =>
      _$RejectRequestDtoFromJson(json);

  final RejectRequestDtoRejectionCode rejectionCode;
  final String? comment;

  Map<String, Object?> toJson() => _$RejectRequestDtoToJson(this);
}
