import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/platform/web_download.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-11-05 (web): a file the user asked to download goes to the
/// browser's own downloads. A cross-origin link ignores `<a download>`, so the
/// bytes are fetched first; when the browser refuses that (CORS), the link
/// opens in a new tab and the browser shows or saves it.
Future<void> downloadInBrowser(
  String url, {
  required String name,
  String? mime,
  void Function(double progress)? onProgress,
}) async {
  final Response<List<int>> res;
  try {
    res = await Dio().get<List<int>>(
      url,
      options: Options(responseType: ResponseType.bytes),
      onReceiveProgress: onProgress == null
          ? null
          : (got, total) {
              if (total > 0) onProgress(got / total);
            },
    );
  } on DioException catch (e) {
    if (e.type != DioExceptionType.connectionError &&
        e.type != DioExceptionType.unknown) {
      rethrow;
    }
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    return;
  }
  saveBytesInBrowser(
    Uint8List.fromList(res.data ?? const []),
    name,
    mime ?? res.headers.value(Headers.contentTypeHeader) ?? '',
  );
}
