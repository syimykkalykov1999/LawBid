import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:lawbid/core/platform/browser_tab.dart';
import 'package:lawbid/core/platform/web_download.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-11-05 (web): a file the user asked to download goes to the
/// browser's own downloads. A cross-origin link ignores `<a download>`, so the
/// bytes are fetched first; when the browser refuses that (CORS), the link
/// opens in a new tab and the browser shows or saves it. That tab comes
/// after the fetch, so Safari and phones may block it: then this throws
/// [BrowserTabBlocked] instead of pretending the file arrived.
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
    if (!await openInNewTab(Uri.parse(url))) throw const BrowserTabBlocked();
    return;
  }
  saveBytesInBrowser(
    Uint8List.fromList(res.data ?? const []),
    name,
    mime ?? res.headers.value(Headers.contentTypeHeader) ?? '',
  );
}

/// The browser did not let the page open a new tab (popup blocker).
class BrowserTabBlocked implements Exception {
  const BrowserTabBlocked();

  @override
  String toString() => 'BrowserTabBlocked';
}

/// Tests stand in for the browser's tabs here; set, the code takes the
/// browser's path.
@visibleForTesting
BrowserTabs? debugBrowserTabs;

/// Tests answer here instead of url_launcher on the phone's path.
@visibleForTesting
Future<bool> Function(Uri url)? debugLaunchExternal;

/// True when links open in browser tabs (the website), false in the app.
bool get opensInBrowserTab => debugBrowserTabs != null || kIsWeb;

BrowserTabs get _tabs => debugBrowserTabs ?? platformBrowserTabs;

bool _webSafe(Uri url) => url.scheme == 'https' || url.scheme == 'http';

Future<bool> _launchExternal(Uri url) async {
  final debug = debugLaunchExternal;
  if (debug != null) return debug(url);
  try {
    return await launchUrl(url, mode: LaunchMode.externalApplication);
  } on Object {
    return false;
  }
}

/// Opens [url] in a new tab now (website) or outside the app (phone);
/// false when nothing opened it. On the website the answer is real:
/// url_launcher says «opened» even when the browser blocked the tab.
Future<bool> openInNewTab(Uri url) async {
  if (!opensInBrowserTab) return _launchExternal(url);
  if (!_webSafe(url)) return false;
  return _tabs.open(url.toString()) != null;
}

/// Row 58 (owner 2026-11-12, «одна и та же ошибка везде»): a tab opened
/// in the tap, before the link is known. Safari, iOS and Android browsers
/// block `window.open` once the tap's `await` has run (the click no longer
/// counts), so the page opens an empty tab right away and points it at the
/// file when the link arrives — the same fix as the admin's (#957). In the
/// app it holds nothing and [go] opens the link outside the app as before.
class PendingTab {
  PendingTab._(this._tab);

  /// Call in the tap itself, before any `await`.
  factory PendingTab.open() =>
      PendingTab._(opensInBrowserTab ? _tabs.open('about:blank') : null);

  BrowserTab? _tab;

  /// Shows [url]: in the waiting tab, or a new one if the browser still
  /// allows it; false when nothing opened it.
  Future<bool> go(Uri url) async {
    if (!opensInBrowserTab) return _launchExternal(url);
    final tab = _tab;
    _tab = null;
    if (!_webSafe(url)) {
      tab?.close();
      return false;
    }
    if (tab == null) return _tabs.open(url.toString()) != null;
    tab.go(url.toString());
    return true;
  }

  /// Nothing to show (an error, the user gave up): the empty tab goes.
  void close() {
    _tab?.close();
    _tab = null;
  }
}

/// Opens the link [load] fetches (a signed URL, a server call): on the
/// website the tab is opened in the tap and pointed at the link when it
/// arrives; in the app the link opens outside the app after it arrives.
/// False when nothing opened it ([load] gave null or the browser blocked
/// the tab) — the caller says so, never «opened». Errors of [load] are
/// passed on after the empty tab is closed.
Future<bool> openAfter(Future<Uri?> Function() load) async {
  final tab = PendingTab.open();
  final Uri? url;
  try {
    url = await load();
  } on Object {
    tab.close();
    rethrow;
  }
  if (url == null) {
    tab.close();
    return false;
  }
  return tab.go(url);
}
