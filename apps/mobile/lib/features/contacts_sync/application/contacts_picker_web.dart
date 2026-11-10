import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/features/contacts_sync/application/contacts_picker.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart'
    show PhoneBookEntry;
import 'package:web/web.dart' as web;

/// The browser half of [ContactsPicker]: the W3C Contact Picker API, which
/// package:web does not describe, so its two calls are declared here.
ContactsPicker createContactsPicker() => _BrowserPicker();

extension type _ContactsManager._(JSObject _) implements JSObject {
  external JSPromise<JSArray<_ContactInfo>> select(
    JSArray<JSString> properties,
    _SelectOptions options,
  );
}

extension type _SelectOptions._(JSObject _) implements JSObject {
  external factory _SelectOptions({bool multiple});
}

extension type _ContactInfo._(JSObject _) implements JSObject {
  external JSArray<JSString>? get name;
  external JSArray<JSString>? get tel;
}

class _BrowserPicker implements ContactsPicker {
  _ContactsManager? get _manager {
    final nav = web.window.navigator as JSObject;
    if (!nav.has('contacts')) return null;
    final m = nav['contacts'];
    return m.isA<JSObject>() ? m! as _ContactsManager : null;
  }

  @override
  bool get supported =>
      _manager != null && (web.window as JSObject).has('ContactsManager');

  @override
  Future<List<PhoneBookEntry>?> pick() async {
    final m = _manager;
    if (m == null) return null;
    try {
      // Called before the first await: still inside the tap's gesture.
      final picked = await m
          .select(
            ['name'.toJS, 'tel'.toJS].toJS,
            _SelectOptions(multiple: true),
          )
          .toDart;
      return entriesFromPicked([
        for (final c in picked.toDart)
          (
            names: [for (final n in c.name?.toDart ?? <JSString>[]) n.toDart],
            numbers: [for (final t in c.tel?.toDart ?? <JSString>[]) t.toDart],
          ),
      ]);
    } on Object catch (e) {
      // Closed, refused, or another picker already open.
      debugPrint('contacts picker: $e');
      return null;
    }
  }
}
