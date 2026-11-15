import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'escpos.dart';

class PrinterChoice {
  const PrinterChoice({required this.name, required this.address});

  final String name;
  final String address;
}

abstract class ReceiptPrinter {
  Future<List<PrinterChoice>> paired();

  Future<String?> print(PrinterChoice printer, List<int> bytes);

  Future<PrinterChoice?> remembered();

  Future<void> remember(PrinterChoice printer);

  Future<PaperWidth> paper();

  Future<void> setPaper(PaperWidth paper);
}

class BluetoothReceiptPrinter implements ReceiptPrinter {
  const BluetoothReceiptPrinter();

  static const _nameKey = 'myca.printer.name';
  static const _addressKey = 'myca.printer.address';
  static const _paperKey = 'myca.printer.paper';

  @override
  Future<List<PrinterChoice>> paired() async {
    if (!await PrintBluetoothThermal.isPermissionBluetoothGranted) return const [];
    final list = await PrintBluetoothThermal.pairedBluetooths;
    return [for (final item in list) PrinterChoice(name: item.name, address: item.macAdress)];
  }

  @override
  Future<String?> print(PrinterChoice printer, List<int> bytes) async {
    if (!await PrintBluetoothThermal.bluetoothEnabled) return 'Turn on Bluetooth, then print again.';
    if (!await PrintBluetoothThermal.connectionStatus) {
      final connected = await PrintBluetoothThermal.connect(macPrinterAddress: printer.address);
      if (!connected) return 'Could not connect to ${printer.name}. Check it is on and paired.';
    }
    final sent = await PrintBluetoothThermal.writeBytes(bytes);
    return sent ? null : 'The printer did not take the receipt. Try again.';
  }

  @override
  Future<PrinterChoice?> remembered() async {
    final prefs = await SharedPreferences.getInstance();
    final address = prefs.getString(_addressKey);
    if (address == null || address.isEmpty) return null;
    return PrinterChoice(name: prefs.getString(_nameKey) ?? 'Printer', address: address);
  }

  @override
  Future<void> remember(PrinterChoice printer) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_nameKey, printer.name);
    await prefs.setString(_addressKey, printer.address);
  }

  @override
  Future<PaperWidth> paper() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_paperKey) == '80' ? PaperWidth.mm80 : PaperWidth.mm58;
  }

  @override
  Future<void> setPaper(PaperWidth paper) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_paperKey, paper == PaperWidth.mm80 ? '80' : '58');
  }
}
