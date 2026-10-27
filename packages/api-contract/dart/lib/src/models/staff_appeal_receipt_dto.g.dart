// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_appeal_receipt_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAppealReceiptDto _$StaffAppealReceiptDtoFromJson(
  Map<String, dynamic> json,
) => StaffAppealReceiptDto(
  id: json['id'] as String,
  number: json['number'] as num,
  status: StaffAppealReceiptDtoStatus.fromJson(json['status'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$StaffAppealReceiptDtoToJson(
  StaffAppealReceiptDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'number': instance.number,
  'status': instance.status.toJson(),
  'createdAt': instance.createdAt.toIso8601String(),
};
