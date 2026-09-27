// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

part 'cases_client.g.dart';

@RestApi()
abstract class CasesClient {
  factory CasesClient(Dio dio, {String? baseUrl}) = _CasesClient;

  /// Stub until docs/04_CASES_BIDS.md §3 (stage 4.2).
  ///
  /// Only enforces the §11 step 3A contact gate: never succeeds yet. A client with both contacts verified gets 501 NOT_IMPLEMENTED.
  @POST('/cases')
  Future<void> createCase({@Extras() Map<String, dynamic>? extras});
}
