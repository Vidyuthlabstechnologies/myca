import { modelConfigured, translateWithModel } from './model-adapter.mjs';
import { confirmationIntent } from './chat-confirm.mjs';

const SCRIPTS = [
  ['hi', /[ऀ-ॿ]/],
  ['te', /[ఀ-౿]/],
];
const NAMES = { hi: 'Hindi', te: 'Telugu' };
const MODEL_OFF = {
  hi: 'मैं अभी केवल अंग्रेज़ी में काम कर सकता हूँ। हिंदी में बात करने के लिए MyCA में मॉडल कुंजी (MYCA_MODEL_API_KEY) सेट करें, या अंग्रेज़ी में लिखें। कुछ भी दर्ज नहीं किया गया।',
  te: 'ప్రస్తుతం నేను ఇంగ్లీష్‌లో మాత్రమే పని చేయగలను. తెలుగులో మాట్లాడటానికి MyCA లో మోడల్ కీ (MYCA_MODEL_API_KEY) సెట్ చేయండి, లేదా ఇంగ్లీష్‌లో రాయండి. ఏదీ నమోదు కాలేదు.',
};
const NOT_UNDERSTOOD = {
  hi: 'मैं इस संदेश का अनुवाद पक्के तौर पर नहीं कर सका, और संख्याओं का अंदाज़ा नहीं लगाता। कृपया अंग्रेज़ी में लिखें या अंकों को वैसे ही दोहराएँ। कुछ भी दर्ज नहीं किया गया।',
  te: 'ఈ సందేశాన్ని నేను ఖచ్చితంగా అనువదించలేకపోయాను, సంఖ్యలను ఊహించను. దయచేసి ఇంగ్లీష్‌లో రాయండి లేదా అంకెలను అలాగే మళ్ళీ చెప్పండి. ఏదీ నమోదు కాలేదు.',
};
const SAY_IT_PLAINLY = {
  hi: 'पोस्ट करने के लिए "हाँ" लिखें, या रद्द करने के लिए "नहीं"। अभी कुछ भी दर्ज नहीं किया गया।',
  te: 'పోస్ట్ చేయడానికి "అవును" అని రాయండి, రద్దు చేయడానికి "వద్దు" అని రాయండి. ఇప్పటివరకు ఏదీ నమోదు కాలేదు.',
};
const READ_AS = { hi: 'अंग्रेज़ी में समझा गया', te: 'ఇంగ్లీష్‌లో అర్థం చేసుకున్నది' };
const DECISIONS = {
  yes: ['हाँ', 'हां', 'जी', 'जी हाँ', 'जी हां', 'ठीक है', 'ठीक', 'कर दो', 'हाँ करो', 'అవును', 'సరే', 'ఓకే', 'చేయండి', 'చేయి'],
  no: ['नहीं', 'नही', 'ना', 'मत करो', 'रहने दो', 'रद्द', 'కాదు', 'వద్దు', 'లేదు', 'రద్దు', 'చేయవద్దు'],
};
const DIGIT_BLOCKS = [0x0966, 0x0C66];

export function languageOf(text) {
  const value = String(text || '');
  for (const [code, script] of SCRIPTS) if (script.test(value)) return code;
  return null;
}

function asciiDigits(text) {
  return String(text || '').replace(/[०-९౦-౯]/g, (ch) => {
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

export async function throughLanguage(message, runEnglish) {
  const language = languageOf(message);
  if (!language) return runEnglish(message);
  const decision = localDecision(message);
  if (decision) {
    const out = await runEnglish(decision);
    if (!modelConfigured()) return { ...out, language, understood: decision, translated: false, localDecision: true };
    const back = await translateWithModel({ text: out.reply, from: 'English', to: NAMES[language] });
    if (!back.ok || !figuresKept(out.reply, back.text)) return { ...out, language, understood: decision, translated: false, localDecision: true };
    return { ...out, reply: back.text, replyEnglish: out.reply, language, understood: decision, translated: true, localDecision: true };
  }
  if (!modelConfigured()) return { reply: MODEL_OFF[language], tools: [], language, blocked: true };
  const understood = await translateWithModel({ text: message, from: NAMES[language], to: 'English' });
  if (!understood.ok || !figuresKept(message, understood.text)) return { reply: NOT_UNDERSTOOD[language], tools: [], language, blocked: true };
  const decided = confirmationIntent(understood.text);
  if (decided && decided !== 'cancel') return { reply: SAY_IT_PLAINLY[language], tools: [], posted: false, language, understood: understood.text, blocked: true };
  const out = await runEnglish(understood.text, { translated: true });
  const back = await translateWithModel({ text: out.reply, from: 'English', to: NAMES[language] });
  const reading = out.awaitingConfirmation ? `\n${READ_AS[language]}: "${understood.text}"` : '';
  if (!back.ok || !figuresKept(out.reply, back.text)) return { ...out, reply: `${out.reply}${reading}`, language, understood: understood.text, translated: false };
  return { ...out, reply: `${back.text}${reading}`, replyEnglish: out.reply, language, understood: understood.text, translated: true };
}
