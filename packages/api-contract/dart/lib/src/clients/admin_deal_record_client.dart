// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

part 'admin_deal_record_client.g.dart';

@RestApi()
abstract class AdminDealRecordClient {
  factory AdminDealRecordClient(Dio dio, {String? baseUrl}) =
      _AdminDealRecordClient;

  /// A sample deal record PDF rendered with the texts as they are now (both signatures drawn as sample images)
  @GET('/admin/deal-record/preview')
  @DioResponseType(ResponseType.stream)
  Stream<String> previewDealRecord({@Extras() Map<String, dynamic>? extras});
}
