abstract class TokenStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class MemoryTokenStore implements TokenStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

class RecoveringTokenStore implements TokenStore {
  RecoveringTokenStore(this.inner, {required this.clear});

  final TokenStore inner;
  final Future<void> Function() clear;

  Future<void> _wipe() async {
    try {
      await clear();
    } on Object {
      return;
    }
  }

  @override
  Future<String?> read(String key) async {
    try {
      return await inner.read(key);
    } on Object {
      await _wipe();
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await inner.write(key, value);
    } on Object {
      await _wipe();
      await inner.write(key, value);
    }
  }

  @override
  Future<void> delete(String key) async {
    try {
      await inner.delete(key);
    } on Object {
      await _wipe();
    }
  }
}
