import 'package:file_picker/file_picker.dart';
import 'package:file_picker_web/file_picker_web.dart';

/// Web: a big file from iCloud or a HEIC to convert arrives after the window
/// gets focus back; don't drop it (as `cancelUploadOnWindowBlur: false` did
/// on file_picker 11).
const WebOptions pickerWebOptions =
    FilePickerWebOptions(cancelUploadOnWindowBlur: false);
