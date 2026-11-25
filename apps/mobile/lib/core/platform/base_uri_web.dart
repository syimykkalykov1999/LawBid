import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

Uri baseUri() => Uri.parse(web.document.baseURI);

/// A plain file name, nothing that could leave the page's own folder.
final _fileName = RegExp(r'^[A-Za-z0-9_.-]+$');

/// Pack F (ROUND5 F8): the deployed name of a database file, when
/// boot_head.js says there is one (`window.__lbDb.worker` / `.sqlite`, the
/// content-hash copies web-immutable.py makes); otherwise [plainName].
Uri dbFileUri(String plainName, String key) {
  var name = plainName;
  final db = globalContext.getProperty<JSAny?>('__lbDb'.toJS);
  if (db != null && db.isA<JSObject>()) {
    final value = (db as JSObject).getProperty<JSAny?>(key.toJS);
    if (value != null && value.isA<JSString>()) {
      final s = (value as JSString).toDart;
      if (_fileName.hasMatch(s)) name = s;
    }
  }
  return baseUri().resolve(name);
}
