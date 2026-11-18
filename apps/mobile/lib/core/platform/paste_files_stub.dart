import 'package:image_picker/image_picker.dart' show XFile;

void Function() listenForPastedFiles(
  void Function(List<XFile> files) onFiles, {
  required bool Function() accept,
}) =>
    () {};
