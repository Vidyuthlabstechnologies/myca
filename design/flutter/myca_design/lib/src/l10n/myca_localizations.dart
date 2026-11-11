import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'myca_localizations_ar.dart';
import 'myca_localizations_en.dart';
import 'myca_localizations_es.dart';
import 'myca_localizations_fr.dart';
import 'myca_localizations_hi.dart';
import 'myca_localizations_ms.dart';
import 'myca_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of MycaLocalizations
/// returned by `MycaLocalizations.of(context)`.
///
/// Applications need to include `MycaLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/myca_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: MycaLocalizations.localizationsDelegates,
///   supportedLocales: MycaLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the MycaLocalizations.supportedLocales
/// property.
abstract class MycaLocalizations {
  MycaLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static MycaLocalizations of(BuildContext context) {
    return Localizations.of<MycaLocalizations>(context, MycaLocalizations)!;
  }

  static const LocalizationsDelegate<MycaLocalizations> delegate =
      _MycaLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
    Locale('es'),
    Locale('fr'),
    Locale('hi'),
    Locale('ms'),
    Locale('zh'),
  ];

  /// No description provided for @actionContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get actionContinue;

  /// No description provided for @actionSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get actionSave;

  /// No description provided for @actionCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get actionCancel;

  /// No description provided for @actionApprove.
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get actionApprove;

  /// No description provided for @actionEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get actionEdit;

  /// No description provided for @actionShare.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get actionShare;

  /// No description provided for @actionTryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get actionTryAgain;

  /// No description provided for @actionAskBahi.
  ///
  /// In en, this message translates to:
  /// **'Ask Bahi'**
  String get actionAskBahi;

  /// No description provided for @statusDraft.
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get statusDraft;

  /// No description provided for @statusDue.
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get statusDue;

  /// No description provided for @statusOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get statusOverdue;

  /// No description provided for @statusFiled.
  ///
  /// In en, this message translates to:
  /// **'Filed'**
  String get statusFiled;

  /// No description provided for @statusPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get statusPaid;

  /// No description provided for @statusNeedsReview.
  ///
  /// In en, this message translates to:
  /// **'Needs a look'**
  String get statusNeedsReview;

  /// No description provided for @moneyIn.
  ///
  /// In en, this message translates to:
  /// **'Money in'**
  String get moneyIn;

  /// No description provided for @moneyOut.
  ///
  /// In en, this message translates to:
  /// **'Money out'**
  String get moneyOut;

  /// No description provided for @balance.
  ///
  /// In en, this message translates to:
  /// **'Balance'**
  String get balance;

  /// No description provided for @nothingYet.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet'**
  String get nothingYet;

  /// No description provided for @errorOffline.
  ///
  /// In en, this message translates to:
  /// **'You\'re offline. We\'ll keep this and send it when you\'re back.'**
  String get errorOffline;

  /// No description provided for @errorGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong on our side. Your books are safe.'**
  String get errorGeneric;

  /// No description provided for @approvalPromise.
  ///
  /// In en, this message translates to:
  /// **'Nothing is filed or paid until you approve it.'**
  String get approvalPromise;

  /// No description provided for @taxDueOn.
  ///
  /// In en, this message translates to:
  /// **'{taxName} due on {date}'**
  String taxDueOn(String taxName, String date);

  /// No description provided for @dataStaysIn.
  ///
  /// In en, this message translates to:
  /// **'Your data stays in {country}.'**
  String dataStaysIn(String country);

  /// No description provided for @bahiHello.
  ///
  /// In en, this message translates to:
  /// **'Hi {name}, I\'m Bahi. I keep your books tidy.'**
  String bahiHello(String name);
}

class _MycaLocalizationsDelegate
    extends LocalizationsDelegate<MycaLocalizations> {
  const _MycaLocalizationsDelegate();

  @override
  Future<MycaLocalizations> load(Locale locale) {
    return SynchronousFuture<MycaLocalizations>(
      lookupMycaLocalizations(locale),
    );
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'ar',
    'en',
    'es',
    'fr',
    'hi',
    'ms',
    'zh',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_MycaLocalizationsDelegate old) => false;
}

MycaLocalizations lookupMycaLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return MycaLocalizationsAr();
    case 'en':
      return MycaLocalizationsEn();
    case 'es':
      return MycaLocalizationsEs();
    case 'fr':
      return MycaLocalizationsFr();
    case 'hi':
      return MycaLocalizationsHi();
    case 'ms':
      return MycaLocalizationsMs();
    case 'zh':
      return MycaLocalizationsZh();
  }

  throw FlutterError(
    'MycaLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
