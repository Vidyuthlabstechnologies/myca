import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'token_store.dart';

class KeystoreTokenStore implements TokenStore {
  const KeystoreTokenStore();

  static const _storage = FlutterSecureStorage();

  static TokenStore recovering() => RecoveringTokenStore(const KeystoreTokenStore(), clear: _storage.deleteAll);

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}
