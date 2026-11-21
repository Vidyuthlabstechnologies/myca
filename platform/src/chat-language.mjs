import { modelConfigured, translateWithModel } from './model-adapter.mjs';
import { confirmationIntent } from './chat-confirm.mjs';

const SCRIPTS = [
  ['hi', /[ऀ-ॿ]/],
  ['bn', /[ঀ-৿]/],
  ['gu', /[઀-૿]/],
  ['ta', /[஀-௿]/],
  ['te', /[ఀ-౿]/],
  ['kn', /[ಀ-೿]/],
];
const NAMES = { hi: 'Hindi', mr: 'Marathi', gu: 'Gujarati', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', bn: 'Bengali' };
export const CHAT_LANGUAGES = Object.freeze(Object.keys(NAMES));
const MODEL_OFF = {
  hi: 'मैं अभी केवल अंग्रेज़ी में काम कर सकता हूँ। हिंदी में बात करने के लिए MyCA में मॉडल कुंजी (MYCA_MODEL_API_KEY) सेट करें, या अंग्रेज़ी में लिखें। कुछ भी दर्ज नहीं किया गया।',
  mr: 'सध्या मी फक्त इंग्रजीतच काम करू शकतो. मराठीत बोलण्यासाठी MyCA मध्ये मॉडेल की (MYCA_MODEL_API_KEY) सेट करा, किंवा इंग्रजीत लिहा. काहीही नोंदवलेले नाही.',
  gu: 'હમણાં હું ફક્ત અંગ્રેજીમાં જ કામ કરી શકું છું. ગુજરાતીમાં વાત કરવા માટે MyCA માં મોડેલ કી (MYCA_MODEL_API_KEY) સેટ કરો, અથવા અંગ્રેજીમાં લખો. કંઈ નોંધાયું નથી.',
  ta: 'இப்போதைக்கு என்னால் ஆங்கிலத்தில் மட்டும்தான் வேலை செய்ய முடியும். தமிழில் பேச MyCA-வில் மாடல் கீ (MYCA_MODEL_API_KEY) அமைக்கவும், அல்லது ஆங்கிலத்தில் எழுதுங்கள். எதுவும் பதிவு செய்யப்படவில்லை.',
  te: 'ప్రస్తుతం నేను ఇంగ్లీష్‌లో మాత్రమే పని చేయగలను. తెలుగులో మాట్లాడటానికి MyCA లో మోడల్ కీ (MYCA_MODEL_API_KEY) సెట్ చేయండి, లేదా ఇంగ్లీష్‌లో రాయండి. ఏదీ నమోదు కాలేదు.',
  kn: 'ಸದ್ಯಕ್ಕೆ ನಾನು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಮಾತ್ರ ಕೆಲಸ ಮಾಡಬಲ್ಲೆ. ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಲು MyCA ನಲ್ಲಿ ಮಾಡೆಲ್ ಕೀ (MYCA_MODEL_API_KEY) ಸೆಟ್ ಮಾಡಿ, ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಬರೆಯಿರಿ. ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.',
  bn: 'এখন আমি শুধু ইংরেজিতেই কাজ করতে পারি। বাংলায় কথা বলতে MyCA-তে মডেল কী (MYCA_MODEL_API_KEY) সেট করুন, অথবা ইংরেজিতে লিখুন। কিছুই রেকর্ড করা হয়নি।',
};
const NOT_UNDERSTOOD = {
  hi: 'मैं इस संदेश का अनुवाद पक्के तौर पर नहीं कर सका, और संख्याओं का अंदाज़ा नहीं लगाता। कृपया अंग्रेज़ी में लिखें या अंकों को वैसे ही दोहराएँ। कुछ भी दर्ज नहीं किया गया।',
  mr: 'या मेसेजचा अनुवाद मला नक्की करता आला नाही, आणि मी आकड्यांचा अंदाज लावत नाही. कृपया इंग्रजीत लिहा किंवा आकडे जसेच्या तसे पुन्हा लिहा. काहीही नोंदवलेले नाही.',
  gu: 'આ મેસેજનો અનુવાદ હું પાકો કરી શક્યો નહીં, અને હું આંકડાનો અંદાજ નથી લગાવતો. મહેરબાની કરીને અંગ્રેજીમાં લખો અથવા આંકડા જેમ છે તેમ ફરી લખો. કંઈ નોંધાયું નથી.',
  ta: 'இந்த மெசேஜை என்னால் சரியாக மொழிபெயர்க்க முடியவில்லை, எண்களை நான் ஊகிப்பதில்லை. தயவுசெய்து ஆங்கிலத்தில் எழுதுங்கள் அல்லது எண்களை அப்படியே மீண்டும் எழுதுங்கள். எதுவும் பதிவு செய்யப்படவில்லை.',
  te: 'ఈ సందేశాన్ని నేను ఖచ్చితంగా అనువదించలేకపోయాను, సంఖ్యలను ఊహించను. దయచేసి ఇంగ్లీష్‌లో రాయండి లేదా అంకెలను అలాగే మళ్ళీ చెప్పండి. ఏదీ నమోదు కాలేదు.',
  kn: 'ಈ ಮೆಸೇಜ್ ಅನ್ನು ನನಗೆ ಸರಿಯಾಗಿ ಅನುವಾದ ಮಾಡಲು ಆಗಲಿಲ್ಲ, ಮತ್ತು ನಾನು ಅಂಕೆಗಳನ್ನು ಊಹಿಸುವುದಿಲ್ಲ. ದಯವಿಟ್ಟು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಬರೆಯಿರಿ ಅಥವಾ ಅಂಕೆಗಳನ್ನು ಇದ್ದ ಹಾಗೆಯೇ ಮತ್ತೆ ಬರೆಯಿರಿ. ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.',
  bn: 'এই মেসেজটা আমি ঠিকঠাক অনুবাদ করতে পারিনি, আর আমি সংখ্যা আন্দাজ করি না। দয়া করে ইংরেজিতে লিখুন বা সংখ্যাগুলো যেমন আছে তেমনই আবার লিখুন। কিছুই রেকর্ড করা হয়নি।',
};
const SAY_IT_PLAINLY = {
  hi: 'पोस्ट करने के लिए "हाँ" लिखें, या रद्द करने के लिए "नहीं"। अभी कुछ भी दर्ज नहीं किया गया।',
  mr: 'पोस्ट करण्यासाठी "हो" लिहा, किंवा रद्द करण्यासाठी "नको". अजून काहीही नोंदवलेले नाही.',
  gu: 'પોસ્ટ કરવા માટે "હા" લખો, અથવા રદ કરવા માટે "ના". હજી કંઈ નોંધાયું નથી.',
  ta: 'போஸ்ட் செய்ய "ஆமா" என்று எழுதுங்கள், ரத்து செய்ய "வேண்டாம்" என்று எழுதுங்கள். இதுவரை எதுவும் பதிவு செய்யப்படவில்லை.',
  te: 'పోస్ట్ చేయడానికి "అవును" అని రాయండి, రద్దు చేయడానికి "వద్దు" అని రాయండి. ఇప్పటివరకు ఏదీ నమోదు కాలేదు.',
  kn: 'ಪೋಸ್ಟ್ ಮಾಡಲು "ಹೌದು" ಎಂದು ಬರೆಯಿರಿ, ರದ್ದು ಮಾಡಲು "ಬೇಡ" ಎಂದು ಬರೆಯಿರಿ. ಇನ್ನೂ ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.',
  bn: 'পোস্ট করতে "হ্যাঁ" লিখুন, বাতিল করতে "না"। এখনও কিছুই রেকর্ড করা হয়নি।',
};
const READ_AS = {
  hi: 'अंग्रेज़ी में समझा गया',
  mr: 'इंग्रजीत असे समजले',
  gu: 'અંગ્રેજીમાં આ રીતે સમજાયું',
  ta: 'ஆங்கிலத்தில் புரிந்துகொண்டது',
  te: 'ఇంగ్లీష్‌లో అర్థం చేసుకున్నది',
  kn: 'ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಅರ್ಥ ಮಾಡಿಕೊಂಡದ್ದು',
  bn: 'ইংরেজিতে যা বুঝেছি',
};
const DECISIONS = {
  yes: [
    'हाँ', 'हां', 'जी', 'जी हाँ', 'जी हां', 'हाँ जी', 'हां जी', 'ठीक है', 'ठीक', 'कर दो', 'हाँ करो', 'चलेगा',
    'हो', 'होय', 'हो करा', 'चालेल', 'ठीक आहे', 'बरं', 'करा', 'करून टाका',
    'હા', 'હાં', 'હા કરો', 'બરાબર', 'ચાલશે', 'ઠીક છે', 'કરો', 'કરી દો',
    'ஆமா', 'ஆமாம்', 'சரி', 'ஓகே', 'செய்யுங்கள்', 'செய்', 'பண்ணுங்க', 'பண்ணு',
    'అవును', 'ఔను', 'సరే', 'ఓకే', 'అలాగే', 'చేయండి', 'చేయి',
    'ಹೌದು', 'ಹೂಂ', 'ಸರಿ', 'ಓಕೆ', 'ಆಗಲಿ', 'ಮಾಡಿ', 'ಮಾಡು',
    'হ্যাঁ', 'হ্যা', 'হাঁ', 'ঠিক আছে', 'আচ্ছা', 'ওকে', 'করো', 'করুন', 'করে দাও',
  ],
  no: [
    'नहीं', 'नही', 'ना', 'मत करो', 'रहने दो', 'रद्द', 'रद्द करो',
    'नाही', 'नको', 'नको करू', 'रद्द करा', 'राहू दे', 'राहू द्या',
    'ના', 'નહીં', 'ના કરો', 'રહેવા દો', 'રદ', 'રદ કરો',
    'இல்லை', 'இல்ல', 'வேண்டாம்', 'வேணாம்', 'ரத்து', 'ரத்து செய்',
    'కాదు', 'వద్దు', 'లేదు', 'రద్దు', 'చేయవద్దు',
    'ಇಲ್ಲ', 'ಬೇಡ', 'ಬೇಡಾ', 'ರದ್ದು', 'ರದ್ದು ಮಾಡಿ', 'ಮಾಡಬೇಡಿ',
    'না', 'থাক', 'বাতিল', 'বাতিল করুন', 'কোরো না', 'করবেন না',
  ],
};
const DIGIT_BLOCKS = [0x0966, 0x09E6, 0x0AE6, 0x0BE6, 0x0C66, 0x0CE6];
const NATIVE_DIGIT = /[०-९০-৯૦-૯௦-௯౦-౯೦-೯]/g;

export function chatLanguageHint(lang) {
  const code = String(lang || '').trim().toLowerCase();
  return Object.hasOwn(NAMES, code) ? code : null;
}

export function languageOf(text, lang) {
  const value = String(text || '');
  for (const [code, script] of SCRIPTS) {
    if (script.test(value)) return code === 'hi' && chatLanguageHint(lang) === 'mr' ? 'mr' : code;
  }
  return null;
}

export function asciiDigits(text) {
  return String(text || '').replace(NATIVE_DIGIT, (ch) => {
    const code = ch.charCodeAt(0);
    const base = DIGIT_BLOCKS.find((start) => code >= start && code <= start + 9);
    return String(code - base);
  });
}

export function figuresOf(text) {
  return (asciiDigits(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));
}

export function figuresKept(source, translated) {
  const a = figuresOf(source).sort();
  const b = figuresOf(translated).sort();
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

export function localDecision(text) {
  const said = String(text || '').trim().replace(/[।.!,\s]+$/g, '').replace(/\s+/g, ' ');
  if (!said) return null;
  if (DECISIONS.yes.includes(said)) return 'yes';
  if (DECISIONS.no.includes(said)) return 'no';
  return null;
}

async function replyIn(language, out, extra = {}) {
  const back = await translateWithModel({ text: out.reply, from: 'English', to: NAMES[language] });
  if (!back.ok || !figuresKept(out.reply, back.text)) return null;
  return { ...out, reply: back.text, replyEnglish: out.reply, language, translated: true, ...extra };
}

export async function throughLanguage(message, runEnglish, { lang } = {}) {
  const hint = chatLanguageHint(lang);
  const written = languageOf(message, hint);
  if (!written) {
    if (!hint) return runEnglish(message);
    const out = await runEnglish(message);
    if (!modelConfigured()) return out;
    return (await replyIn(hint, out)) || out;
  }
  const language = hint || written;
  const decision = localDecision(message);
  if (decision) {
    const out = await runEnglish(decision);
    const local = { language, understood: decision, localDecision: true };
    if (!modelConfigured()) return { ...out, ...local, translated: false };
    return (await replyIn(language, out, local)) || { ...out, ...local, translated: false };
  }
  if (!modelConfigured()) return { reply: MODEL_OFF[language], tools: [], language, blocked: true };
  const understood = await translateWithModel({ text: message, from: NAMES[written], to: 'English' });
  if (!understood.ok || !figuresKept(message, understood.text)) return { reply: NOT_UNDERSTOOD[language], tools: [], language, blocked: true };
  const decided = confirmationIntent(understood.text);
  if (decided && decided !== 'cancel') return { reply: SAY_IT_PLAINLY[language], tools: [], posted: false, language, understood: understood.text, blocked: true };
  const out = await runEnglish(understood.text, { translated: true });
  const back = await translateWithModel({ text: out.reply, from: 'English', to: NAMES[language] });
  const reading = out.awaitingConfirmation ? `\n${READ_AS[language]}: "${understood.text}"` : '';
  if (!back.ok || !figuresKept(out.reply, back.text)) return { ...out, reply: `${out.reply}${reading}`, language, understood: understood.text, translated: false };
  return { ...out, reply: `${back.text}${reading}`, replyEnglish: out.reply, language, understood: understood.text, translated: true };
}
