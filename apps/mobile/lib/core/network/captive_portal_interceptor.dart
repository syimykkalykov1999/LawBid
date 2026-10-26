import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';

/// S15-13: a captive portal (hotel / airport Wi-Fi sign-in page) answers
/// `200` or a redirect with an HTML page to the API URL. The generated client
/// would choke on the String body and the failure looked like an unknown
/// parse error. Here a JSON route that got `text/html` becomes an error with
/// that HTML response attached: [ApiException.fromDioException] reads it as
/// [ApiException.captivePortalCode] (a network failure), the retry policy
/// does not retry it (not a 502/503/504) and the reachability signal counts
/// it as "not reachable". No new UI: callers keep their existing offline
/// handling.
class CaptivePortalInterceptor extends Interceptor {
  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final options = response.requestOptions;
    if (options.responseType == ResponseType.json &&
        options.extra[RequestFlags.expectsHtml] != true &&
        isCaptivePortalResponse(response)) {
      handler.reject(
        DioException(
          requestOptions: options,
          response: response,
          type: DioExceptionType.badResponse,
          message: 'A Wi-Fi sign-in page answered instead of the server.',
        ),
      );
      return;
    }
    handler.next(response);
  }
}
