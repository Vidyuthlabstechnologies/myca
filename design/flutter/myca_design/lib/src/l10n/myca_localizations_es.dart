// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'myca_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Spanish Castilian (`es`).
class MycaLocalizationsEs extends MycaLocalizations {
  MycaLocalizationsEs([String locale = 'es']) : super(locale);

  @override
  String get actionContinue => 'Continuar';

  @override
  String get actionSave => 'Guardar';

  @override
  String get actionCancel => 'Cancelar';

  @override
  String get actionApprove => 'Aprobar';

  @override
  String get actionEdit => 'Editar';

  @override
  String get actionShare => 'Compartir';

  @override
  String get actionTryAgain => 'Intentar de nuevo';

  @override
  String get actionAskBahi => 'Pregúntale a Bahi';

  @override
  String get statusDraft => 'Borrador';

  @override
  String get statusDue => 'Pendiente';

  @override
  String get statusOverdue => 'Vencido';

  @override
  String get statusFiled => 'Presentado';

  @override
  String get statusPaid => 'Pagado';

  @override
  String get statusNeedsReview => 'Revisar';

  @override
  String get moneyIn => 'Ingresos';

  @override
  String get moneyOut => 'Gastos';

  @override
  String get balance => 'Saldo';

  @override
  String get nothingYet => 'Aún no hay nada';

  @override
  String get errorOffline =>
      'Sin conexión. Lo guardamos y lo enviamos cuando vuelvas.';

  @override
  String get errorGeneric =>
      'Algo falló de nuestro lado. Tus libros están a salvo.';

  @override
  String get approvalPromise =>
      'Nada se presenta ni se paga sin tu aprobación.';

  @override
  String taxDueOn(String taxName, String date) {
    return '$taxName vence el $date';
  }

  @override
  String dataStaysIn(String country) {
    return 'Tus datos se quedan en $country.';
  }

  @override
  String bahiHello(String name) {
    return 'Hola $name, soy Bahi. Mantengo tus libros en orden.';
  }
}
