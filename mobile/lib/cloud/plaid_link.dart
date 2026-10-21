import 'dart:async';

import 'package:plaid_flutter/plaid_flutter.dart';

abstract class PlaidLinkOpener {
  Future<String?> open(String linkToken);
}

class DevicePlaidLink implements PlaidLinkOpener {
  const DevicePlaidLink();

  @override
  Future<String?> open(String linkToken) async {
    final done = Completer<String?>();
    final success = PlaidLink.onSuccess.listen((event) {
      if (!done.isCompleted) done.complete(event.publicToken);
    });
    final exit = PlaidLink.onExit.listen((_) {
      if (!done.isCompleted) done.complete(null);
    });
    try {
      await PlaidLink.create(configuration: LinkTokenConfiguration(token: linkToken));
      await PlaidLink.open();
      return await done.future;
    } finally {
      await success.cancel();
      await exit.cancel();
    }
  }
}

class NoPlaidLink implements PlaidLinkOpener {
  const NoPlaidLink();

  @override
  Future<String?> open(String linkToken) async => null;
}
