import 'package:flutter_test/flutter_test.dart';
import 'package:myca/cloud/cloud_session.dart';

void main() {
  test('the bank feed is offered to UK and US businesses and not to others', () {
    final plaid = ConnectorView.fromJson({
      'channel': 'plaid',
      'title': 'Plaid (US and UK bank feeds)',
      'country': 'US',
      'countries': ['US', 'GB'],
      'fields': ['clientId', 'secret'],
      'secrets': ['secret'],
    });
    final taxjar = ConnectorView.fromJson({'channel': 'taxjar', 'title': 'TaxJar', 'country': 'US', 'fields': ['apiToken'], 'secrets': ['apiToken']});
    final list = ConnectorList(pulls: true, connectors: [taxjar, plaid]);
    expect(list.forCountry('GB').map((view) => view.channel), ['plaid']);
    expect(list.forCountry('US').map((view) => view.channel), containsAll(['plaid', 'taxjar']));
    expect(list.forCountry('IN'), isEmpty);
  });
}
