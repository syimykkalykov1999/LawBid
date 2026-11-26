/// Outside the browser the phone channels answer (system_data_saver.dart).
bool browserSaveData() => false;

/// Nothing to listen to outside the browser.
Stream<bool> browserSaveDataChanges() => const Stream<bool>.empty();
