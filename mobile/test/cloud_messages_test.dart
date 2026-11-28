import 'package:flutter_test/flutter_test.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/format.dart';
import 'package:myca/india/lang/hi_cloud.dart';
import 'package:myca/india/lang/mr.dart';

void main() {
  tearDown(() => formatLanguage = 'en');

  test('English stays English', () {
    formatLanguage = 'en';
    expect(cloudMessage('INVALID_CODE'), 'That code is not right. Check it and try again.');
    expect(cloudMessage('NOPE', 'Server hint.'), 'Server hint.');
    expect(cloudMessage('NOPE'), 'Something went wrong (NOPE).');
  });

  test('a server message comes out in Hindi and in Marathi when the app is in that language', () {
    formatLanguage = 'hi';
    expect(cloudMessage('INVALID_CODE'), 'वह कोड सही नहीं है। जाँचें और फिर कोशिश करें।');
    expect(cloudMessage('TOO_MANY_REQUESTS'), 'बहुत सारे कोड मँगाए गए। एक घंटे बाद फिर कोशिश करें।');
    formatLanguage = 'mr';
    expect(cloudMessage('INVALID_CODE'), 'तो कोड बरोबर नाही. तपासा आणि पुन्हा प्रयत्न करा.');
    expect(cloudMessage('INVALID_GSTIN'), 'तो GSTIN बरोबर नाही. तुमच्या नोंदणी प्रमाणपत्राशी जुळवून पाहा.');
  });

  test('a code the app has no line for keeps its English, and a server hint is shown as sent', () {
    formatLanguage = 'hi';
    expect(cloudMessage('UNHEARD_OF', 'Plain hint from the server.'), 'Plain hint from the server.');
    expect(cloudMessage('UNHEARD_OF'), 'कुछ गड़बड़ हो गई (UNHEARD_OF)।');
    expect(cloudMessage('HOUSEHOLD_US_ONLY'), 'A personal tax return is for US filers. Choose the United States first.', reason: 'a US-only message is not shown in Hindi');
  });

  test('the wait message and the tries-left message carry their numbers in each language', () {
    formatLanguage = 'en';
    expect(waitMessage(30), 'That was a lot of requests in a short time. Try again in 30 seconds.');
    expect(waitMessage(60), 'That was a lot of requests in a short time. Try again in a minute.');
    expect(waitMessage(300), 'That was a lot of requests in a short time. Try again in 5 minutes.');
    expect(waitMessage(0), cloudMessage('RATE_LIMITED'));
    formatLanguage = 'hi';
    expect(waitMessage(30), 'थोड़े समय में बहुत ज़्यादा अनुरोध हुए। 30 सेकंड बाद फिर कोशिश करें।');
    expect(waitMessage(300), 'थोड़े समय में बहुत ज़्यादा अनुरोध हुए। 5 मिनट बाद फिर कोशिश करें।');
    expect(secondStepMessage('INVALID_CODE', 2), 'वह कोड सही नहीं है। 2 कोशिशें बाकी हैं।');
    expect(secondStepMessage('INVALID_CODE', 1), 'वह कोड सही नहीं है। 1 कोशिश बाकी है।');
    formatLanguage = 'mr';
    expect(waitMessage(300), 'थोड्या वेळात खूप विनंत्या झाल्या. 5 मिनिटे नंतर पुन्हा प्रयत्न करा.');
    expect(secondStepMessage('INVALID_CODE', 3), 'तो कोड बरोबर नाही. 3 प्रयत्न बाकी आहेत.');
  });

  test('the end of a two-step attempt says so in each language', () {
    formatLanguage = 'hi';
    expect(secondStepMessage('TOO_MANY_ATTEMPTS', null), 'यह साइन इन कोशिश खत्म हो गई। फिर से शुरू करें दबाएँ और दोबारा साइन इन करें।');
    formatLanguage = 'mr';
    expect(secondStepMessage('CODE_EXPIRED', null), 'हा साइन-इन प्रयत्न संपला. पुन्हा सुरू करा दाबा आणि पुन्हा साइन-इन करा.');
  });

  test('the recovery-code note carries its number', () {
    formatLanguage = 'hi';
    expect(const SecondStepResult(usedRecoveryCode: true, recoveryCodesLeft: 4).recoveryNote, 'आपने रिकवरी कोड इस्तेमाल किया। 4 बचे हैं। सिक्योरिटी में नए बनाएँ।');
    expect(const SecondStepResult(usedRecoveryCode: false, recoveryCodesLeft: 4).recoveryNote, '');
  });

  test('both language tables carry the same placeholders for every line they added', () {
    for (final entry in hiCloud.entries) {
      final line = marathi[entry.key];
      if (line == null) continue;
      expect(RegExp(r'\{\w+\}').allMatches(line).map((m) => m.group(0)).toSet(), RegExp(r'\{\w+\}').allMatches(entry.value).map((m) => m.group(0)).toSet(), reason: entry.key);
    }
  });
}
