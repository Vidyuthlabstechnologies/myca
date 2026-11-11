// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'myca_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class MycaLocalizationsFr extends MycaLocalizations {
  MycaLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get actionContinue => 'Continuer';

  @override
  String get actionSave => 'Enregistrer';

  @override
  String get actionCancel => 'Annuler';

  @override
  String get actionApprove => 'Approuver';

  @override
  String get actionEdit => 'Modifier';

  @override
  String get actionShare => 'Partager';

  @override
  String get actionTryAgain => 'Réessayer';

  @override
  String get actionAskBahi => 'Demander à Bahi';

  @override
  String get statusDraft => 'Brouillon';

  @override
  String get statusDue => 'À payer';

  @override
  String get statusOverdue => 'En retard';

  @override
  String get statusFiled => 'Déposée';

  @override
  String get statusPaid => 'Payé';

  @override
  String get statusNeedsReview => 'À vérifier';

  @override
  String get moneyIn => 'Entrées';

  @override
  String get moneyOut => 'Sorties';

  @override
  String get balance => 'Solde';

  @override
  String get nothingYet => 'Rien pour le moment';

  @override
  String get errorOffline =>
      'Vous êtes hors ligne. Nous le gardons et l’enverrons à votre retour.';

  @override
  String get errorGeneric =>
      'Un problème est survenu de notre côté. Vos comptes sont en sécurité.';

  @override
  String get approvalPromise => 'Rien n’est déposé ni payé sans votre accord.';

  @override
  String taxDueOn(String taxName, String date) {
    return '$taxName à payer le $date';
  }

  @override
  String dataStaysIn(String country) {
    return 'Vos données restent au $country.';
  }

  @override
  String bahiHello(String name) {
    return 'Bonjour $name, je suis Bahi. Je tiens vos comptes en ordre.';
  }
}
