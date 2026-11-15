// Row 149 (file_picker 13): the web picker's options live in
// package:file_picker_web, which only a browser build may import.
export 'picker_web_options_stub.dart'
    if (dart.library.js_interop) 'picker_web_options_web.dart';
