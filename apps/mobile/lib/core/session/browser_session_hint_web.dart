import 'package:lawbid/core/session/browser_session_hint.dart';
import 'package:web/web.dart' as web;

BrowserSessionHint createBrowserSessionHint() => _CookieHint();

/// A session cookie (no Expires / Max-Age): the browser drops it on close.
class _CookieHint implements BrowserSessionHint {
  static const _name = 'lb_signed';

  String get _attrs {
    final secure = web.window.location.protocol == 'https:' ? '; Secure' : '';
    return '; Path=/; SameSite=Strict$secure';
  }

  @override
  bool get isSet =>
      web.document.cookie.split(';').any((c) => c.trim() == '$_name=1');

  @override
  void set() => web.document.cookie = '$_name=1$_attrs';

  @override
  void clear() => web.document.cookie = '$_name=; Max-Age=0$_attrs';
}
