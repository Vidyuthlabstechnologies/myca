abstract class AppLock {
  Future<bool> available();
  Future<bool> unlock(String reason);
}

class NoAppLock implements AppLock {
  const NoAppLock();

  @override
  Future<bool> available() async => false;

  @override
  Future<bool> unlock(String reason) async => true;
}

const lockAfter = Duration(minutes: 2);
