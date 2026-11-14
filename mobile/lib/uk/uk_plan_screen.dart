import 'package:flutter/material.dart';

import 'uk_common.dart';

class UkPlan {
  const UkPlan({required this.id, required this.title, required this.price, required this.forWho, required this.includes, required this.productId});

  final String id;
  final String title;
  final String price;
  final String forWho;
  final List<String> includes;
  final String productId;
}

const ukPlans = <UkPlan>[
  UkPlan(id: 'uk-sole-trader', productId: 'myca_uk_sole_trader_monthly', title: 'Sole Trader', price: '£49 a month', forWho: 'One sole trader or landlord', includes: [
    'Digital records, invoices and bills with VAT',
    'MTD for Income Tax: quarterly updates, calculations, final declaration and amendments',
    'MTD for VAT: nine-box returns built from your books',
    'Tax estimate, deadline calendar and penalty points guide',
  ]),
  UkPlan(id: 'uk-business', productId: 'myca_uk_business_monthly', title: 'Business', price: '£99 a month', forWho: 'A growing business with staff or an accountant in the books', includes: [
    'Everything in Sole Trader',
    'More people in the same books',
    'Priority help',
  ]),
  UkPlan(id: 'uk-accountant', productId: 'myca_uk_accountant_monthly', title: 'Accountant firm', price: '£499 a month', forWho: 'Firms filing for many clients', includes: [
    'Everything in Business, for every client',
    'File as the agent with HMRC\'s agent declaration',
  ]),
];

const ukSelfAssessmentAddOn = 'Self Assessment return preparation: £149 per return, paid separately.';

const ukPlansNotOpen = 'Plans open when MyCA UK launches on Google Play. Until then the app runs against HMRC\'s test service and nothing is charged.';

const ukPlanTerms = 'Each plan has a 14-day free trial. Google Play shows the final price, including VAT, before you pay, and you can cancel any time in Google Play, Subscriptions.';

class UkPlanScreen extends StatelessWidget {
  const UkPlanScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Plan and billing')),
      body: ListView(
        padding: ukPagePadding,
        children: [
          const UkCard(key: Key('uk.plan.notOpen'), children: [UkNote(ukPlansNotOpen)]),
          const SizedBox(height: 12),
          for (final plan in ukPlans) ...[
            UkCard(
              key: Key('uk.plan.${plan.id}'),
              children: [
                Text(plan.title, style: text.titleMedium),
                const SizedBox(height: 4),
                Text(plan.price, style: text.headlineSmall),
                const SizedBox(height: 4),
                Text(plan.forWho, style: text.bodyMedium),
                const SizedBox(height: 8),
                for (final line in plan.includes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('• $line', style: text.bodyMedium),
                  ),
              ],
            ),
            const SizedBox(height: 12),
          ],
          const UkNote(ukSelfAssessmentAddOn),
          const UkNote(ukPlanTerms),
          const UkFooter(),
        ],
      ),
    );
  }
}
