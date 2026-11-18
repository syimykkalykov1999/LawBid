import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/platform/paste_files_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/paste_files_web.dart'
    as impl;

/// Row 185 (website): files pasted into the page with Ctrl+V / Cmd+V — a
/// screenshot, a copied picture. The browser's own `paste` event, read from
/// `clipboardData.files` (no clipboard permission prompt). A paste that also
/// carries plain text is left to the text field. [accept] is asked first:
/// false leaves the paste to the page. Returns the stop function; outside
/// the browser nothing is listened to.
void Function() listenForPastedFiles(
  void Function(List<XFile> files) onFiles, {
  required bool Function() accept,
}) =>
    impl.listenForPastedFiles(onFiles, accept: accept);
