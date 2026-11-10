import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

class DueItem {
  const DueItem({required this.key, required this.when, required this.title, required this.detail, required this.overdue});

  final String key;
  final String when;
  final String title;
  final String detail;
  final bool overdue;

  static DueItem? fromJson(Object? json) {
    if (json is! Map) return null;
    final when = '${json['when'] ?? ''}';
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(when)) return null;
    return DueItem(key: '${json['kind'] ?? ''}:${json['title'] ?? ''}:$when', when: when, title: '${json['title'] ?? ''}', detail: '${json['detail'] ?? ''}', overdue: json['overdue'] == true);
  }
}

abstract class NotificationPlanner {
  Future<void> plan(List<DueItem> items);
}

class NoNotifications implements NotificationPlanner {
  const NoNotifications();

  @override
  Future<void> plan(List<DueItem> items) async {}
}

class RecordingNotifications implements NotificationPlanner {
  final planned = <List<DueItem>>[];

  @override
  Future<void> plan(List<DueItem> items) async => planned.add(items);
}

const _reminderHour = 9;
const _maxScheduled = 20;

class DeviceNotifications implements NotificationPlanner {
  DeviceNotifications({FlutterLocalNotificationsPlugin? plugin, DateTime Function()? now}) : _plugin = plugin ?? FlutterLocalNotificationsPlugin(), _now = now ?? DateTime.now;

  final FlutterLocalNotificationsPlugin _plugin;
  final DateTime Function() _now;
  bool _ready = false;
  bool _allowed = false;

  Future<bool> _init() async {
    if (_ready) return _allowed;
    _ready = true;
    tzdata.initializeTimeZones();
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@drawable/ic_stat_myca'),
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      ),
    );
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    _allowed = await android?.requestNotificationsPermission() ?? await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
    return _allowed;
  }

  @override
  Future<void> plan(List<DueItem> items) async {
    if (!await _init()) return;
    await _plugin.cancelAll();
    final today = _now();
    var id = 1;
    for (final item in items.where((item) => !item.overdue).take(_maxScheduled)) {
      final parts = item.when.split('-').map(int.parse).toList();
      final at = DateTime(parts[0], parts[1], parts[2], _reminderHour);
      if (!at.isAfter(today)) continue;
      await _plugin.zonedSchedule(
        id: id++,
        title: item.title,
        body: item.detail.isEmpty ? 'Due today. Open MyCA to deal with it.' : item.detail,
        scheduledDate: tz.TZDateTime.from(at, tz.local),
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails('myca_due', 'What is due', channelDescription: 'Filings, reminders and payroll falling due', importance: Importance.defaultImportance),
          iOS: DarwinNotificationDetails(threadIdentifier: 'myca_due'),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    }
  }
}
