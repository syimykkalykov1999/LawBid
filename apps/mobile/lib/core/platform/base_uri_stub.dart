Uri baseUri() => Uri.base;

/// Off the web there is no deployed copy: the plain name.
Uri dbFileUri(String plainName, String key) => baseUri().resolve(plainName);
