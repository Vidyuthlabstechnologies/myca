import 'package:flutter/services.dart';

abstract class PlaidLinkOpener {
  Future<String?> open(String linkToken);
}

class PlaidUnavailable implements Exception {
  const PlaidUnavailable();
}

class ChannelPlaidLink implements PlaidLinkOpener {
  const ChannelPlaidLink();

  static const MethodChannel channel = MethodChannel('in.myca.myca/plaid_link');

  @override
  Future<String?> open(String linkToken) async {
    try {
      return await channel.invokeMethod<String>('openLink', {'token': linkToken});
    } on MissingPluginException {
      throw const PlaidUnavailable();
    } on PlatformException catch (e) {
      if (e.code == 'UNAVAILABLE') throw const PlaidUnavailable();
      rethrow;
    }
  }
}

class NoPlaidLink implements PlaidLinkOpener {
  const NoPlaidLink();

  @override
  Future<String?> open(String linkToken) async => null;
}
