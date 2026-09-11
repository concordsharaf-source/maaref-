import { useEffect, useMemo, useState } from 'react'
import questionBank from './data/questions.json'
import { categories, categoryMap } from './data/categories'

const LETTERS = ['أ', 'ب', 'ج', 'د']
const STORAGE_KEY = 'maaref-progress-v1'
const SETTINGS_KEY = 'maaref-settings-v1'
const AUTO_ADVANCE_OPTIONS = [2, 3, 5, 8]
const DIFFICULTY_LABELS = { 1: 'سهل', 2: 'مألوف', 3: 'متوسط', 4: 'متقدم', 5: 'تحدٍ' }

const emptyStats = {
  answered: 0,
  correct: 0,
  sessions: 0,
  totalPoints: 0,
  bestScore: 0,
  dailyBest: 0,
  dailyDate: '',
  categoryStats: {},
  seenQuestionIds: [],
}

const defaultSettings = {
  theme: 'light',
  autoAdvance: true,
  autoAdvanceSeconds: 3,
  questionTextSize: 'comfortable',
  reduceMotion: false,
}

function readStats() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    const seenQuestionIds = Array.isArray(saved.seenQuestionIds)
      ? [...new Set(saved.seenQuestionIds.filter((id) => typeof id === 'string'))]
      : []
    return { ...emptyStats, ...saved, categoryStats: saved.categoryStats || {}, seenQuestionIds }
  } catch {
    return emptyStats
  }
}

function readSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}')
    const autoAdvanceSeconds = AUTO_ADVANCE_OPTIONS.includes(Number(saved.autoAdvanceSeconds))
      ? Number(saved.autoAdvanceSeconds)
      : defaultSettings.autoAdvanceSeconds
    return {
      ...defaultSettings,
      theme: saved.theme === 'dark' ? 'dark' : 'light',
      autoAdvance: typeof saved.autoAdvance === 'boolean' ? saved.autoAdvance : defaultSettings.autoAdvance,
      autoAdvanceSeconds,
      questionTextSize: saved.questionTextSize === 'large' ? 'large' : 'comfortable',
      reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : defaultSettings.reduceMotion,
    }
  } catch {
    return defaultSettings
  }
}

function cleanAnswer(value = '') {
  return String(value)
    .toLocaleLowerCase('ar')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function sameAnswer(first, second) {
  return cleanAnswer(first) === cleanAnswer(second)
}

function shuffle(items, random = Math.random) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1))
    ;[copy[index], copy[next]] = [copy[next], copy[index]]
  }
  return copy
}

function seededRandom(seedText) {
  let seed = 0
  for (let index = 0; index < seedText.length; index += 1) {
    seed = (seed * 31 + seedText.charCodeAt(index)) >>> 0
  }
  return () => {
    seed += 0x6d2b79f5
    let value = seed
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat('ar-EG').format(value)
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${formatNumber(minutes)}:${formatNumber(seconds).padStart(2, '٠')}`
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

function isQuizReady(question) {
  const answer = String(question.answer || '').trim()
  return answer.length > 0 && answer.length <= 120 && String(question.question || '').length <= 260
}

function normalizeQuestion(value = '') {
  return String(value)
    .toLocaleLowerCase('ar')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[؟?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferScienceTopic(text) {
  if (/(ذرة|عنصر|جزيء|ايون|أيون|بروتون|نيوترون|الكترون|إلكترون|نواة|نظير|رابطة)/.test(text)) return 'chemistry'
  if (/(خلية|نسيج|عضو|جهاز حيوي|حمض نووي|كروموسوم|جين|انقسام|لقاح|مناعة|بكتيريا|فيروس|فطريات)/.test(text)) return 'biology'
  if (/(نظام بيئي|سلسلة غذائية|منتج|مستهلك|محلل|تنوع حيوي|احتباس|اوزون|أوزون)/.test(text)) return 'environment'
  if (/(مجرة|نجم|كوكب|قمر طبيعي|مذنب|كويكب|ثقب اسود|ثقب أسود|سديم|سنة ضوئية|نظام شمسي)/.test(text)) return 'astronomy'
  return 'physics'
}

function inferNatureTopic(text) {
  if (/(تلقيح|بذرة|جذر|ساق|ورقة|زهرة|ثمرة|نبات|نباتات|حبوب اللقاح)/.test(text)) return 'plant'
  if (/(ثدييات|طيور|زواحف|برمائيات|اسماك|أسماك|حشرات|عنكبيات|رخويات|قشريات|فقاريات|لافقاريات|تمويه|هجرة حيوانية|بيات شتوي|موطن طبيعي|حيوان|حيوانات)/.test(text)) return 'animal'
  if (/(الجهاز|دماغ|قلب|رئت|كبد|كليت|معدة|امعاء|أمعاء|بنكرياس|طحال|عين|اذن|أذن|انف|أنف|لسان|جلد|عظام|عضلات|دم|خلايا الدم)/.test(text)) return 'body'
  return 'ecology'
}

function isFemalePersonQuestion(text = '') {
  return /(^|\s)من هي(?:\s|$)/u.test(text)
    || /(والدة|زوجة|أم النبي|ام النبي|ابنة|بنت|امرأة|المرأة|مؤلفة|كاتبة|فنانة|ممثلة|مخرجة|عالمة|شاعرة|ملكة)/u.test(text)
}

// يحدد نوع الإجابة المطلوب من صياغة السؤال، فلا تختلط العملات بالعواصم أو التعريفات بالأسماء.
function inferAnswerKind({ question, category, answer = '' }) {
  const text = normalizeQuestion(question)
  const answerText = normalizeQuestion(answer)

  if (text.includes('صح أم خطأ')) return 'boolean'
  if (category === 'math') return 'math-number'

  if (category === 'geography') {
    if (text.includes('عملة')) return 'currency'
    if (text.includes('عاصمة لأي دولة') || text.includes('في أي دولة تقع') || text.includes('دولة يمر بها')) return 'country'
    if (text.includes('في أي قارة')) return 'continent'
    if (text.includes('لغة رسمية')) return 'official-language'
    if (text.includes('عاصمة')) return 'capital'
    return 'geography-general'
  }

  if (category === 'science') {
    if (text.includes('الرمز الكيميائي')) return text.includes('ما اسم العنصر') ? 'element' : 'chemical-symbol'
    if (text.includes('العدد الذري')) return text.includes('ما العنصر') ? 'element' : 'atomic-number'
    const scienceTopic = inferScienceTopic(`${text} ${answerText}`)
    if (text.includes('ما المقصود بمصطلح')) return `science-${scienceTopic}-definition`
    if (text.includes('ما المصطلح العلمي')) return `science-${scienceTopic}-term`
    return 'science-general'
  }

  if (category === 'arts') {
    if (text.includes('مؤلف كتاب')) return 'book-author'
    if (text.includes('اذكر كتاب')) return 'book-title'
    if (text.includes('الفنان الذي أنجز لوحة')) return 'artist'
    if (text.includes('اذكر لوحة')) return 'painting'
    return 'arts-general'
  }

  if (category === 'culture') {
    if (text.includes('مخرج فيلم')) return 'film-director'
    if (text.includes('اذكر فيلم')) return 'film-title'
    return 'culture-general'
  }

  if (category === 'history') {
    if (text.includes('ما المقصود بمصطلح')) return 'history-definition'
    if (text.includes('ما المفهوم')) return 'history-term'
    if (text.includes('في أي عام')) return 'history-year'
    if (text.includes('من ينسب إليه')) return 'inventor'
    if (text.includes('اذكر ابتكار')) return 'invention'
    return 'history-general'
  }

  if (category === 'technology') {
    if (text.includes('ما المقصود بمصطلح')) return 'technology-definition'
    if (text.includes('ما المصطلح التقني')) return 'technology-term'
    return 'technology-general'
  }

  if (category === 'language') {
    if (text.includes('ما المقصود بمصطلح')) return 'language-definition'
    if (text.includes('ما المصطلح النحوي أو البلاغي')) return 'language-term'
    return 'language-general'
  }

  if (category === 'sports') {
    if (text.includes('ما المقصود بمصطلح')) return 'sports-definition'
    if (text.includes('ما المصطلح الرياضي')) return 'sports-term'
    return 'sports-general'
  }

  if (category === 'nature') {
    if (text.includes('إلى أي مجموعة حيوانية')) return 'animal-group'
    if (text.includes('ما نمط تغذية')) return 'animal-diet'
    if (text.includes('ما البيئة الشائعة')) return 'animal-habitat'
    if (text.includes('ما الوظيفة الأساسية')) return 'body-function'
    if (text.includes('أي عضو أو جزء من الجسم')) return 'body-organ'
    const natureTopic = inferNatureTopic(`${text} ${answerText}`)
    if (text.includes('ما المقصود بمصطلح')) return `nature-${natureTopic}-definition`
    if (text.includes('ما المصطلح العلمي')) return `nature-${natureTopic}-term`
    return 'nature-general'
  }

  if (category === 'religion') {
    if (text.includes('كم عدد أركان')) return 'religion-pillars-number'
    if (text.includes('كم عدد الصلوات')) return 'religion-prayer-count'
    if (text.includes('كم عدد أشهر')) return 'religion-month-count'
    if (text.includes('إلى كم جزء')) return 'religion-quran-parts'
    if (text.includes('كم يومًا')) return 'religion-ramadan-days'
    if (text.includes('كم ركعة')) return 'religion-rakah-count'
    if (text.includes('في أي يوم من ذي الحجة')) return 'religion-arafah-day'
    if (text.startsWith('كم ')) return 'religion-number'
    if (text.includes('في أي مدينة') || text.includes('إلى أي مدينة')) return 'religion-city'
    if (text.includes('في أي شهر') || text.includes('ما الشهر') || text.includes('ما أول شهور')) return 'religion-month'
    if (text.includes('ما العيد')) return 'religion-eid'
    if (text.includes('ما السورة') || text.includes('ما أول سورة') || text.includes('ما أطول سورة') || text.includes('ما السورتان')) return 'religion-surah'
    if (text.includes('أي نبي') || text.startsWith('من هو') || text.startsWith('من هي') || text.includes('أول البشر') || text.includes('زوجة آدم') || text.includes('ابن إبراهيم') || text.includes('أم النبي')) {
      return isFemalePersonQuestion(text) ? 'religion-female-person' : 'religion-person'
    }
    if (text.includes('ما المسجد') || text.includes('من أي مسجد') || text.includes('أي مسجد') || text.includes('أول مسجد') || text.includes('القبلة الأولى')) return 'religion-mosque'
    if (text.includes('ما الركن')) return 'religion-pillar'
    if (text.includes('إلى أي جهة')) return 'religion-direction'
    if (text.includes('ما الكتاب')) return 'religion-book'
    if (text.includes('بأي لغة')) return 'religion-language'
    if (text.includes('بأي حدث') || text.includes('الرحلة الليلية')) return 'religion-event'
    if (text.includes('البئر')) return 'religion-well'
    if (text.includes('ما اسم الليلة')) return 'religion-night'
    if (text.includes('في أي يوم') || text.includes('ما اليوم') || text.includes('في أي فترة') || text.startsWith('متى ')) return 'religion-time'
    if (text.includes('ما اسم الشخص') || text.includes('الاسم الذي يطلق على')) return 'religion-role'
    if (text.includes('ما العبارة') || text.includes('ما الدعاء')) return 'religion-phrase'
    if (text.includes('ما نوع التقويم')) return 'religion-calendar'
    if (text.includes('ما الشرط')) return 'religion-condition'
    if (text.includes('ما الذي يمتنع')) return 'religion-fasting'
    if (text.includes('ما السلوك')) return 'religion-value'
    if (text.includes('ما النداء')) return 'religion-call'
    if (text.includes('بين أي موضعين')) return 'religion-place'
    if (text.includes('ما الطهارة') || text.includes('ما اسم الدوران') || text.includes('ما اسم الحالة') || text.includes('ما اسم الانحناء') || text.includes('ما اسم وضع')) return 'religion-practice'
    if (text.includes('ما المقصود')) return 'religion-definition'
    return 'religion-general'
  }

  return `${category}-general`
}

// بدائل احتياطية مدققة لنوع الإجابة. لا نستخدم بدائل عشوائية من فئة مختلفة.
const fallbackOptions = {
  boolean: ['صحيح.', 'خطأ.'],
  // تسميات نقدية عامة تمنع تلميح اسم البلد داخل الاختيار نفسه.
  currency: ['ريال', 'درهم', 'جنيه', 'دولار', 'يورو', 'ين', 'ليرة', 'فرنك', 'كرونة', 'روبية', 'بيزو', 'وون', 'شيكل', 'دينار'],
  country: ['مصر', 'السعودية', 'فرنسا', 'اليابان', 'كندا', 'المغرب', 'تركيا', 'البرازيل', 'الهند', 'أستراليا'],
  capital: ['القاهرة', 'الرياض', 'باريس', 'طوكيو', 'أوتاوا', 'الرباط', 'أنقرة', 'برازيليا', 'نيودلهي', 'كانبرا'],
  continent: ['آسيا', 'أفريقيا', 'أوروبا', 'أمريكا الشمالية', 'أمريكا الجنوبية', 'أوقيانوسيا', 'القارة القطبية الجنوبية'],
  'official-language': ['اللغة العربية', 'اللغة الإنجليزية', 'اللغة الفرنسية', 'اللغة الإسبانية', 'اللغة البرتغالية', 'اللغة الألمانية'],
  'chemical-symbol': ['H', 'O', 'C', 'Fe', 'Au', 'Ag', 'Na', 'Cl', 'Ca', 'He'],
  element: ['الهيدروجين', 'الأكسجين', 'الكربون', 'الحديد', 'الذهب', 'الفضة', 'الصوديوم', 'الكلور', 'الكالسيوم', 'الهيليوم'],
  'atomic-number': ['1', '2', '6', '8', '11', '17', '20', '26', '47', '79'],
  'history-year': ['1215', '1453', '1492', '1776', '1789', '1914', '1918', '1945', '1969', '1989'],
  inventor: ['ألكسندر غراهام بيل', 'توماس إديسون', 'يوهانس غوتنبرغ', 'جيمس واط', 'الأخوان رايت', 'غولييلمو ماركوني'],
  invention: ['الهاتف', 'المصباح الكهربائي العملي', 'الطباعة بالحروف المتحركة', 'المحرك البخاري المحسن', 'الراديو', 'التلغراف'],
  'animal-group': ['الثدييات', 'الطيور', 'الزواحف', 'البرمائيات', 'الأسماك', 'الحشرات', 'العنكبيات', 'الرخويات', 'القشريات'],
  'animal-diet': ['آكل لحوم', 'آكل نباتات', 'قارت', 'يتغذى على الحشرات غالبًا', 'يتغذى على كائنات مائية صغيرة'],
  'animal-habitat': ['السهول الإفريقية', 'غابات آسيا', 'الصحارى', 'البحار والمحيطات', 'الغابات', 'أستراليا', 'المناطق الرطبة'],
  'religion-number': ['خمسة', 'أربعة', 'ستة', 'سبعة'],
  'religion-pillars-number': ['خمسة', 'أربعة', 'ستة', 'سبعة'],
  'religion-prayer-count': ['خمس صلوات', 'أربع صلوات', 'ست صلوات', 'سبع صلوات'],
  'religion-month-count': ['اثنا عشر شهرًا', 'عشرة أشهر', 'أحد عشر شهرًا', 'ثلاثة عشر شهرًا'],
  'religion-quran-parts': ['ثلاثون جزءًا', 'عشرون جزءًا', 'أربعون جزءًا', 'ستون جزءًا'],
  'religion-ramadan-days': ['تسعة وعشرون أو ثلاثون يومًا', 'ثمانية وعشرون يومًا', 'واحد وثلاثون يومًا', 'ثلاثون أو واحد وثلاثون يومًا'],
  'religion-rakah-count': ['ركعتان', 'ثلاث ركعات', 'أربع ركعات', 'خمس ركعات'],
  'religion-arafah-day': ['اليوم التاسع', 'اليوم الثامن', 'اليوم العاشر', 'اليوم السابع'],
  'religion-city': ['مكة المكرمة', 'المدينة المنورة', 'القدس', 'الطائف', 'جدة'],
  'religion-month': ['محرم', 'رمضان', 'شوال', 'ذو الحجة', 'صفر', 'ربيع الأول', 'رجب'],
  'religion-eid': ['عيد الفطر', 'عيد الأضحى'],
  'religion-surah': ['سورة الفاتحة', 'سورة البقرة', 'سورة الإخلاص', 'سورة مريم', 'سورتا الفلق والناس'],
  'religion-person': ['النبي محمد صلى الله عليه وسلم', 'نوح عليه السلام', 'إبراهيم عليه السلام', 'موسى عليه السلام', 'عيسى عليه السلام', 'يوسف عليه السلام', 'يونس عليه السلام', 'داود عليه السلام', 'أيوب عليه السلام'],
  // عند السؤال عن امرأة تظل البدائل أسماء نساء فقط، لا أسماء رجال.
  'religion-female-person': ['مريم عليها السلام', 'هاجر عليها السلام', 'حواء عليها السلام', 'آسية بنت مزاحم', 'خديجة بنت خويلد', 'فاطمة بنت محمد'],
  'religion-mosque': ['المسجد الحرام', 'المسجد النبوي', 'المسجد الأقصى', 'مسجد قباء'],
  'religion-pillar': ['الشهادتان', 'الصلاة', 'الزكاة', 'الصيام', 'الحج'],
  'religion-direction': ['الكعبة المشرفة', 'المسجد الأقصى'],
  'religion-book': ['القرآن الكريم', 'التوراة', 'الإنجيل', 'الزبور'],
  'religion-language': ['اللغة العربية', 'اللغة العبرية', 'اللغة السريانية', 'اللغة الآرامية'],
  'religion-event': ['هجرة النبي محمد إلى المدينة المنورة', 'الإسراء', 'المعراج', 'فتح مكة'],
  'religion-well': ['بئر زمزم', 'بئر رومة', 'بئر أريس'],
  'religion-time': ['العشر الأواخر', 'اليوم التاسع', 'يوم الجمعة', 'عند طلوع الفجر', 'بعد غروب الشمس', 'قبل صلاة عيد الفطر'],
  'religion-role': ['المؤذن', 'الإمام', 'الخطيب', 'المعتكف'],
  'religion-phrase': ['بسم الله الرحمن الرحيم', 'الشهادتان', 'السلام عليكم', 'سبحان الله'],
  'religion-calendar': ['التقويم القمري', 'التقويم الشمسي', 'التقويم الميلادي'],
  'religion-condition': ['الاستطاعة', 'الإسلام', 'البلوغ', 'العقل'],
  'religion-fasting': ['المفطرات', 'الصيام', 'الإمساك', 'السحور'],
  'religion-value': ['التقوى', 'الإخلاص', 'الصبر', 'الصدق'],
  'religion-call': ['الأذان', 'الإقامة', 'التلبية', 'التكبير'],
  'religion-place': ['الصفا والمروة', 'عرفات ومزدلفة', 'منى وعرفات', 'بئر زمزم'],
  'religion-night': ['ليلة القدر', 'ليلة الإسراء والمعراج', 'ليلة النصف من شعبان'],
  'religion-practice': ['الوضوء', 'الطواف', 'السعي', 'الإحرام', 'الركوع', 'السجود'],
  'religion-definition': ['الجهة التي يتوجه إليها المسلم في الصلاة', 'الإقرار بوحدانية الله ورسالة محمد'],
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function trimFact(value = '') {
  return String(value).replace(/[.؟?]+$/u, '').trim()
}

function estimateQuestionDifficulty(question) {
  const text = normalizeQuestion(question.question)
  const answer = trimFact(question.answer)
  let difficulty = 2

  if (text.includes('صح أم خطأ') || text.includes('صح ام خطا')) difficulty = 1
  if (question.category === 'math') {
    difficulty = /^كم يساوي \d{1,2}\s*[+−-]/u.test(text) ? 1 : 2
    if (/[×÷%]/u.test(question.question) || /(المتوسط|الجذر|اس |منطق|احتمال)/u.test(text)) difficulty += 1
    if ((question.question.match(/\d+/g) || []).some((value) => Number(value) > 99)) difficulty += 1
  }

  if (question.category === 'arts' || question.category === 'culture') difficulty += 1
  if (/(ما المقصود|ما المصطلح|في اي عام|العدد الذري|الرمز الكيميائي|مؤلف|مخرج|اذكر كتاب|اذكر فيلم|ما البيئة|كم ركعة)/u.test(text)) difficulty += 1
  if (question.question.length > 90) difficulty += 1
  if (question.question.length > 150 || answer.length > 30) difficulty += 1

  return clamp(difficulty, 1, 5)
}

const enrichedQuestionBank = questionBank.map((question) => ({
  ...question,
  answerKind: inferAnswerKind(question),
  difficulty: estimateQuestionDifficulty(question),
}))

const answerPools = enrichedQuestionBank.reduce((pools, question) => {
  const answer = String(question.answer || '').trim()
  if (!answer || answer.length > 120) return pools
  const answers = pools.get(question.answerKind) || []
  if (!answers.some((item) => sameAnswer(item, answer))) answers.push(answer)
  pools.set(question.answerKind, answers)
  return pools
}, new Map())

function uniqueRelatedAnswers(question) {
  const expected = String(question.answer).trim()
  const options = [
    ...(answerPools.get(question.answerKind) || []),
    ...(fallbackOptions[question.answerKind] || []),
  ]
  const seen = new Set()
  return options.filter((answer) => {
    const trimmed = String(answer || '').trim()
    const key = cleanAnswer(trimmed)
    if (!trimmed || trimmed.length > 120 || !key || sameAnswer(trimmed, expected) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// تعرض العملات باسم الفئة النقدية فقط داخل الخيارات. بهذا لا يفضح وصف مثل
// «دينار أردني» إجابة سؤال الأردن، بينما تظل التسمية الرسمية الكاملة في التصحيح بعد الإجابة.
function currencyOptionLabel(value = '') {
  const firstWord = trimFact(value).split(/\s+/u)[0] || ''
  return firstWord.replace(/^ال/u, '') || trimFact(value)
}

function selectProgressiveQuestions(pool, count, random) {
  const total = Math.min(count, pool.length)
  const buckets = Array.from({ length: 5 }, () => [])
  shuffle(pool, random).forEach((question) => buckets[question.difficulty - 1].push(question))

  const selected = []
  for (let index = 0; index < total; index += 1) {
    const target = Math.min(5, Math.floor((index * 5) / total) + 1)
    const levels = [target]
    for (let distance = 1; distance < 5; distance += 1) {
      if (target + distance <= 5) levels.push(target + distance)
      if (target - distance >= 1) levels.push(target - distance)
    }
    const bucket = levels.map((level) => buckets[level - 1]).find((items) => items.length)
    if (bucket) selected.push(bucket.pop())
  }

  return selected.sort((first, second) => first.difficulty - second.difficulty)
}

function createRound(question, random) {
  const expected = String(question.answer).trim()
  const relatedAnswers = question.answerKind === 'currency'
    ? [
        ...shuffle(fallbackOptions.currency || [], random),
        ...shuffle(answerPools.get('currency') || [], random),
      ]
    : shuffle(uniqueRelatedAnswers(question), random)

  if (question.answerKind === 'currency') {
    const usedLabels = new Set([cleanAnswer(currencyOptionLabel(expected))])
    const wrongOptions = relatedAnswers.filter((answer) => {
      const labelKey = cleanAnswer(currencyOptionLabel(answer))
      if (!labelKey || usedLabels.has(labelKey)) return false
      usedLabels.add(labelKey)
      return true
    }).slice(0, 3)

    return {
      ...question,
      // نحفظ القيمة الرسمية للتصحيح، لكن لا نعرض الصفة المرتبطة باسم البلد قبل الإجابة.
      options: shuffle([expected, ...wrongOptions], random).map((value) => ({ value, label: currencyOptionLabel(value) })),
    }
  }

  return {
    ...question,
    // قد يظهر خياران أو ثلاثة فقط عندما لا توجد بدائل صحيحة من المجال نفسه؛ هذا أفضل من خيار غير ذي صلة.
    options: shuffle([expected, ...relatedAnswers.slice(0, 3)], random),
  }
}

function createQuestions({ category = 'all', count = 10, daily = false, excludedQuestionIds = [] }) {
  const excluded = excludedQuestionIds instanceof Set ? excludedQuestionIds : new Set(excludedQuestionIds)
  const matching = enrichedQuestionBank.filter((question) => category === 'all' || question.category === category)
  const pool = matching
    .filter((question) => !excluded.has(question.id))
    .filter(isQuizReady)
    .filter((question) => uniqueRelatedAnswers(question).length > 0)
  const random = daily ? seededRandom(`${todayKey()}-${category}-${count}`) : Math.random
  return selectProgressiveQuestions(pool, count, random).map((question) => createRound(question, random))
}

function AppIcon({ name, className = '', size = 24 }) {
  const common = {
    className: `app-icon ${className}`,
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
  }

  let content
  switch (name) {
    case 'home':
      content = <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></>
      break
    case 'library':
      content = <><rect x="4" y="4" width="6" height="7" rx="1.2" /><rect x="14" y="4" width="6" height="7" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><path d="M14 17h6M17 14v6" /></>
      break
    case 'trophy':
      content = <><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 21h7M9 17h6" /></>
      break
    case 'chart':
      content = <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /><path d="M4 10h0M10 4h0M16 13h0" /></>
      break
    case 'settings':
      content = <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.5 2.5-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21h-3.54v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06-2.5-2.5.06-.06A1.7 1.7 0 0 0 5.72 15a1.7 1.7 0 0 0-1.56-1.04H4.1v-3.54h.06A1.7 1.7 0 0 0 5.72 9.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.5-2.5.06.06a1.7 1.7 0 0 0 1.87.34 1.7 1.7 0 0 0 1.04-1.56V3.7h3.54v.11a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.5 2.5-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.04h.11v3.54h-.11A1.7 1.7 0 0 0 19.4 15Z" /></>
      break
    case 'back':
      content = <><path d="M15 18 9 12l6-6" /><path d="M9 12h11" /></>
      break
    case 'arrow':
      content = <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>
      break
    case 'forward':
      content = <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>
      break
    case 'search':
      content = <><circle cx="10.8" cy="10.8" r="5.8" /><path d="m16 16 4 4" /></>
      break
    case 'close':
      content = <><path d="m6 6 12 12M18 6 6 18" /></>
      break
    case 'play':
      content = <path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none" />
      break
    case 'clock':
      content = <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3.5 2" /></>
      break
    case 'bolt':
      content = <path d="m13 2-8 12h6l-1 8 9-13h-6Z" fill="currentColor" stroke="none" />
      break
    case 'calendar':
      content = <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>
      break
    case 'check':
      content = <path d="m5 12 4.2 4.2L19 6.8" />
      break
    case 'check-circle':
      content = <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12 2.4 2.5 5-5" /></>
      break
    case 'wrong':
      content = <><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6m0-6-6 6" /></>
      break
    case 'info':
      content = <><circle cx="12" cy="12" r="8.5" /><path d="M12 10v5M12 7h.01" /></>
      break
    case 'share':
      content = <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>
      break
    case 'download':
      content = <><path d="M12 3v11M8 10l4 4 4-4M5 20h14" /></>
      break
    case 'sun':
      content = <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
      break
    case 'moon':
      content = <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />
      break
    case 'motion':
      content = <><path d="M5 8h9M5 12h14M5 16h9" /><path d="m15 5 3 3-3 3M17 13l3 3-3 3" /></>
      break
    case 'type':
      content = <><path d="M5 5h14M12 5v14M8 19h8" /></>
      break
    case 'history':
      content = <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 7v5l3 2" /></>
      break
    case 'trash':
      content = <><path d="M4 7h16M10 11v5M14 11v5M9 7l1-3h4l1 3M6 7l1 13h10l1-13" /></>
      break
    case 'palette':
      content = <><path d="M12 3a8.5 8.5 0 1 0 0 17c1.5 0 2.3-.8 2.3-1.8 0-1.2-.8-1.8-.8-2.5 0-.7.5-1.1 1.4-1.1H16A4.8 4.8 0 0 0 20.5 10 7 7 0 0 0 12 3Z" /><path d="M7.8 11h.01M10 7.5h.01M14.3 7.5h.01M17 11h.01" /></>
      break
    case 'devices':
      content = <><rect x="5" y="4" width="14" height="12" rx="1.8" /><path d="M9 20h6M12 16v4" /></>
      break
    case 'film':
      content = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4" /></>
      break
    case 'landmark':
      content = <><path d="m3 9 9-5 9 5M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18M3 17h18" /></>
      break
    case 'flask':
      content = <><path d="M9 3h6M10 3v6l-5 8a2.5 2.5 0 0 0 2.2 4h9.6A2.5 2.5 0 0 0 19 17l-5-8V3" /><path d="M7.8 15h8.4" /></>
      break
    case 'globe':
      content = <><circle cx="12" cy="12" r="8.5" /><path d="M3.8 12h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5c-2.1-2.3-3.2-5.1-3.2-8.5S9.9 5.8 12 3.5" /></>
      break
    case 'religion':
      content = <><path d="M17.5 18.2A7.8 7.8 0 0 1 9.8 5.1 8.5 8.5 0 1 0 17.5 18.2Z" /><path d="m17.5 5.5.7 1.6 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z" /></>
      break
    case 'leaf':
      content = <><path d="M19.5 4.5C11 4.2 5.4 8.1 5.4 14.2c0 3.3 2.3 5.3 5.2 5.3 6.3 0 8.8-7.1 8.9-15Z" /><path d="M5 20c2.5-4.2 6-7 11-9" /></>
      break
    case 'calculator':
      content = <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>
      break
    case 'language':
      content = <><path d="M4 5h10M9 5c0 7-2.5 11-5 13M6 12c1.5 1.8 3.4 3.1 5.7 3.8M14 19l3-8 3 8M15.2 16h3.6" /></>
      break
    case 'spark':
      content = <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z" fill="currentColor" stroke="none" />
      break
    case 'refresh':
      content = <><path d="M20 11a8 8 0 0 0-14-4L4 9" /><path d="M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 20v-5h-5" /></>
      break
    case 'pause':
      content = <><path d="M8 6v12M16 6v12" /></>
      break
    case 'infinity':
      content = <path d="M7.1 8.1c2.5 0 4.9 7.8 7.4 7.8 3.8 0 3.8-7.8 0-7.8-2.5 0-4.9 7.8-7.4 7.8-3.8 0-3.8-7.8 0-7.8Z" />
      break
    case 'medal':
      content = <><circle cx="12" cy="15" r="5" /><path d="m8 3 2.5 7M16 3l-2.5 7M9 3h6" /><path d="m12 12 1 2 2.1.3-1.5 1.5.4 2.1-2-1-2 1 .4-2.1-1.5-1.5 2.1-.3Z" /></>
      break
    default:
      content = <circle cx="12" cy="12" r="7" />
  }

  return <svg {...common}>{content}</svg>
}

function CategoryIcon({ category, className = '', size = 24 }) {
  const names = {
    science: 'flask',
    geography: 'globe',
    religion: 'religion',
    history: 'landmark',
    arts: 'palette',
    culture: 'film',
    technology: 'devices',
    sports: 'trophy',
    language: 'language',
    nature: 'leaf',
    math: 'calculator',
  }
  return <AppIcon name={names[category.id] || 'library'} className={className} size={size} />
}

function Brand({ compact = false, onClick }) {
  return (
    <button className={`brand ${compact ? 'brand--compact' : ''}`} type="button" onClick={onClick} aria-label="العودة إلى الرئيسية">
      <img className="brand__mark" src={`${import.meta.env.BASE_URL}maaref-mark.svg`} alt="" />
      {!compact && <span className="brand__word">معارف</span>}
    </button>
  )
}

function IconButton({ label, icon, onClick, className = '' }) {
  return <button type="button" className={`icon-button ${className}`} onClick={onClick} aria-label={label} title={label}><AppIcon name={icon} /></button>
}

function AppBar({ view, level, points, navigate, onSearch }) {
  const pageMeta = {
    categories: { overline: 'مكتبة معارف', title: 'المعلومات' },
    competitions: { overline: 'ساحة اللعب', title: 'المسابقات' },
    profile: { overline: 'ملف اللاعب', title: 'تقدمي' },
    settings: { overline: 'تخصيص التطبيق', title: 'الإعدادات' },
    results: { overline: 'ملخص الجولة', title: 'النتيجة' },
  }
  const meta = pageMeta[view]
  const canGoBack = view === 'settings' || view === 'results'

  return (
    <header className="app-bar topbar">
      <div className="app-bar__inner app-page">
        {view === 'home' ? (
          <Brand onClick={() => navigate('home')} />
        ) : (
          <div className="app-bar__title">
            {canGoBack && <IconButton label="رجوع" icon="back" onClick={() => navigate('home')} className="app-bar__back" />}
            <div><small>{meta?.overline}</small><h1>{meta?.title}</h1></div>
          </div>
        )}

        <div className="app-bar__actions">
          {view === 'home' && <button className="points-pill" type="button" onClick={() => navigate('profile')} aria-label={`عرض تقدمك، ${formatNumber(points)} نقطة، المستوى ${formatNumber(level)}`}><AppIcon name="spark" size={17} /><span>{formatNumber(points)}</span><b>المستوى {formatNumber(level)}</b></button>}
          {view === 'home' && <IconButton label="الإعدادات" icon="settings" onClick={() => navigate('settings')} />}
          {view === 'competitions' && <IconButton label="عرض تقدمي" icon="chart" onClick={() => navigate('profile')} />}
          {view === 'profile' && <IconButton label="الإعدادات" icon="settings" onClick={() => navigate('settings')} />}
          {view === 'categories' && <IconButton label="بحث في المعلومات" icon="search" onClick={onSearch} />}
        </div>
      </div>
    </header>
  )
}

function BottomNavigation({ items, view, navigate }) {
  return (
    <nav className="bottom-navigation mobile-nav" aria-label="التنقل الرئيسي">
      <div className="bottom-navigation__inner">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bottom-navigation__item mobile-nav__item ${view === item.id ? 'is-active' : ''}`}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}
          >
            <span className="bottom-navigation__icon"><AppIcon name={item.icon} size={23} /></span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function ConfirmDialog({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description" onMouseDown={(event) => event.stopPropagation()}>
        <span className={`confirm-dialog__icon ${dialog.tone === 'danger' ? 'is-danger' : ''}`}><AppIcon name={dialog.tone === 'danger' ? 'trash' : 'info'} /></span>
        <h2 id="dialog-title">{dialog.title}</h2>
        <p id="dialog-description">{dialog.description}</p>
        <div className="confirm-dialog__actions">
          <button className={`app-button ${dialog.tone === 'danger' ? 'app-button--danger' : 'app-button--primary'}`} type="button" onClick={onConfirm}>{dialog.confirmLabel}</button>
          <button className="app-button app-button--text" type="button" onClick={onCancel}>إلغاء</button>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [view, setView] = useState('home')
  const [stats, setStats] = useState(readStats)
  const [session, setSession] = useState(null)
  const [result, setResult] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [categorySearch, setCategorySearch] = useState('')
  const [toast, setToast] = useState('')
  const [settings, setSettings] = useState(readSettings)
  const [isTimerPaused, setIsTimerPaused] = useState(false)
  const [dialog, setDialog] = useState(null)

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(categories.map((category) => [category.id, 0]))
    questionBank.forEach((question) => {
      counts[question.category] = (counts[question.category] || 0) + 1
    })
    return counts
  }, [])

  const unseenQuestionCount = useMemo(() => {
    const seen = new Set(stats.seenQuestionIds)
    return questionBank.reduce((total, question) => total + (seen.has(question.id) ? 0 : 1), 0)
  }, [stats.seenQuestionIds])

  const level = Math.floor(stats.totalPoints / 900) + 1
  const progress = ((stats.totalPoints % 900) / 900) * 100
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0
  const isMainDestination = ['home', 'categories', 'competitions', 'profile', 'settings'].includes(view)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  }, [stats])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    document.documentElement.style.colorScheme = settings.theme === 'dark' ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#141218' : '#6750A4')
  }, [settings])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!dialog) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setDialog(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [dialog])

  // يتوقف عداد الجولة والانتقال التلقائي عند مغادرة التطبيق أو فتح واجهة نظامية مؤقتًا.
  useEffect(() => {
    if (!session) {
      setIsTimerPaused(false)
      return undefined
    }

    const pauseTimers = () => {
      setIsTimerPaused(true)
      setSession((current) => {
        if (!current || current.timersPausedAt) return current
        return { ...current, timersPausedAt: Date.now() }
      })
    }
    const resumeTimers = () => {
      if (document.hidden) return
      setSession((current) => {
        if (!current?.timersPausedAt) return current
        const pausedFor = Math.max(0, Date.now() - current.timersPausedAt)
        return {
          ...current,
          timersPausedAt: 0,
          autoAdvanceUntil: current.autoAdvanceUntil ? current.autoAdvanceUntil + pausedFor : 0,
        }
      })
      setIsTimerPaused(false)
    }
    const handleVisibility = () => (document.hidden ? pauseTimers() : resumeTimers())

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', pauseTimers)
    window.addEventListener('focus', resumeTimers)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', pauseTimers)
      window.removeEventListener('focus', resumeTimers)
    }
  }, [Boolean(session)])

  const navigate = (nextView) => {
    setView(nextView)
    window.scrollTo({ top: 0, behavior: settings.reduceMotion ? 'auto' : 'smooth' })
  }

  const focusCategorySearch = () => {
    window.requestAnimationFrame(() => document.getElementById('category-search')?.focus())
  }

  const startGame = ({ mode = 'practice', category = 'all', count = 10, duration = 0, daily = false } = {}) => {
    const seenQuestionIds = new Set(stats.seenQuestionIds)
    const rounds = createQuestions({ category, count, daily, excludedQuestionIds: seenQuestionIds })
    if (!rounds.length) {
      const place = category === 'all' ? 'بنك معارف' : categoryMap[category]?.title || 'هذه الفئة'
      setToast(`أكملت الأسئلة الجديدة المتاحة في ${place}. يمكنك إعادة إتاحة الأسئلة من الإعدادات.`)
      return
    }

    // تُحجز أسئلة الجولة فورًا كي لا تظهر في جولة لاحقة حتى إن خرج اللاعب قبل إكمالها.
    setStats((previous) => {
      const reserved = new Set(previous.seenQuestionIds)
      rounds.forEach((question) => reserved.add(question.id))
      return { ...previous, seenQuestionIds: [...reserved] }
    })

    const autoAdvanceMs = settings.autoAdvance ? settings.autoAdvanceSeconds * 1000 : 0
    setIsTimerPaused(false)
    setResult(null)
    setSession({
      mode,
      category,
      count: rounds.length,
      duration,
      secondsLeft: duration,
      daily,
      startedAt: Date.now(),
      currentIndex: 0,
      score: 0,
      correctCount: 0,
      answeredCount: 0,
      selectedAnswer: '',
      autoAdvanceEnabled: settings.autoAdvance,
      autoAdvanceMs,
      autoAdvanceUntil: 0,
      autoAdvanceRemaining: 0,
      timersPausedAt: 0,
      questions: rounds,
      config: { mode, category, count, duration, daily },
    })
    navigate('quiz')
  }

  const finishSession = (reason = 'complete') => {
    if (!session) return
    const finished = { ...session, endReason: reason, finishedAt: Date.now() }
    const categoryId = session.category
    setStats((previous) => ({
      ...previous,
      sessions: previous.sessions + 1,
      bestScore: Math.max(previous.bestScore, session.score),
      dailyBest: session.daily && previous.dailyDate === todayKey()
        ? Math.max(previous.dailyBest, session.score)
        : session.daily
          ? session.score
          : previous.dailyBest,
      dailyDate: session.daily ? todayKey() : previous.dailyDate,
      categoryStats: {
        ...previous.categoryStats,
        [categoryId]: previous.categoryStats?.[categoryId] || { answered: 0, correct: 0 },
      },
    }))
    setIsTimerPaused(false)
    setSession(null)
    setResult(finished)
    navigate('results')
  }

  useEffect(() => {
    if (!session || !session.duration || isTimerPaused) return undefined
    if (session.secondsLeft <= 0) {
      finishSession('time')
      return undefined
    }
    const timer = window.setTimeout(() => {
      setSession((current) => current ? { ...current, secondsLeft: current.secondsLeft - 1 } : current)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [session?.secondsLeft, session?.duration, isTimerPaused])

  const answerQuestion = (answer) => {
    if (!session || session.selectedAnswer) return
    const current = session.questions[session.currentIndex]
    const correct = sameAnswer(answer, current.answer)
    const timeBonus = session.duration ? Math.min(50, Math.max(0, Math.floor(session.secondsLeft / 6))) : 0
    const earned = correct ? 100 + timeBonus : 0
    const autoAdvanceMs = session.autoAdvanceEnabled ? session.autoAdvanceMs : 0
    const autoAdvanceUntil = autoAdvanceMs ? Date.now() + autoAdvanceMs : 0

    setSession((previous) => previous ? {
      ...previous,
      selectedAnswer: answer,
      autoAdvanceUntil,
      autoAdvanceRemaining: autoAdvanceMs,
      score: previous.score + earned,
      correctCount: previous.correctCount + (correct ? 1 : 0),
      answeredCount: previous.answeredCount + 1,
    } : previous)

    setStats((previous) => {
      const beforeCategory = previous.categoryStats?.[current.category] || { answered: 0, correct: 0 }
      return {
        ...previous,
        answered: previous.answered + 1,
        correct: previous.correct + (correct ? 1 : 0),
        totalPoints: previous.totalPoints + earned,
        categoryStats: {
          ...previous.categoryStats,
          [current.category]: {
            answered: beforeCategory.answered + 1,
            correct: beforeCategory.correct + (correct ? 1 : 0),
          },
        },
      }
    })
  }

  const nextQuestion = () => {
    if (!session || !session.selectedAnswer) return
    if (session.currentIndex + 1 >= session.questions.length) {
      finishSession('complete')
      return
    }
    setSession((previous) => previous ? {
      ...previous,
      currentIndex: previous.currentIndex + 1,
      selectedAnswer: '',
      autoAdvanceUntil: 0,
      autoAdvanceRemaining: 0,
    } : previous)
  }

  // يبقى زر «السؤال التالي» متاحًا حتى مع تشغيل الانتقال التلقائي.
  useEffect(() => {
    if (isTimerPaused || !session?.selectedAnswer || !session.autoAdvanceUntil) return undefined

    let hasAdvanced = false
    const tick = () => {
      const remaining = Math.max(0, session.autoAdvanceUntil - Date.now())
      setSession((current) => {
        if (!current || current.autoAdvanceUntil !== session.autoAdvanceUntil) return current
        return { ...current, autoAdvanceRemaining: remaining }
      })
      if (remaining <= 0 && !hasAdvanced) {
        hasAdvanced = true
        nextQuestion()
      }
    }

    tick()
    const countdown = window.setInterval(tick, 100)
    return () => window.clearInterval(countdown)
  }, [session?.selectedAnswer, session?.currentIndex, session?.autoAdvanceUntil, isTimerPaused])

  const requestConfirmation = (options) => setDialog(options)

  const abandonSession = () => requestConfirmation({
    title: 'إنهاء المسابقة؟',
    description: 'ستعود إلى الرئيسية ولن تُسجّل نتيجة هذه الجولة. ستظل أسئلتها محجوزة حتى لا تتكرر.',
    confirmLabel: 'إنهاء الجولة',
    tone: 'danger',
    onConfirm: () => {
      setIsTimerPaused(false)
      setSession(null)
      navigate('home')
    },
  })

  const resetProgress = () => requestConfirmation({
    title: 'مسح التقدم المحفوظ؟',
    description: 'سيُحذف رصيد النقاط والنتائج المخزنة على هذا الجهاز فقط، ولا يمكن التراجع عن ذلك.',
    confirmLabel: 'مسح التقدم',
    tone: 'danger',
    onConfirm: () => {
      setStats(emptyStats)
      setToast('تم مسح التقدم المحفوظ.')
    },
  })

  const resetQuestionHistory = () => requestConfirmation({
    title: 'إعادة إتاحة الأسئلة؟',
    description: 'ستصبح جميع الأسئلة متاحة للجولات القادمة، مع الاحتفاظ بنقاطك ونتائجك الحالية.',
    confirmLabel: 'إعادة الإتاحة',
    tone: 'default',
    onConfirm: () => {
      setStats((previous) => ({ ...previous, seenQuestionIds: [] }))
      setToast('تمت إعادة إتاحة جميع الأسئلة للجولات القادمة.')
    },
  })

  const shareResult = async (sharedResult) => {
    const total = sharedResult.questions.length
    const percent = Math.round((sharedResult.correctCount / total) * 100)
    const categoryTitle = sharedResult.category === 'all' ? 'معارف' : categoryMap[sharedResult.category]?.title || 'معارف'
    const text = `أنهيت جولة ${categoryTitle} في معارف: ${formatNumber(sharedResult.correctCount)} من ${formatNumber(total)} إجابة صحيحة بنسبة ${formatNumber(percent)}٪ و${formatNumber(sharedResult.score)} نقطة.`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'نتيجتي في معارف', text })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setToast('تم نسخ نتيجتك لتشاركها.')
      } else {
        setToast('نتيجتك جاهزة للمشاركة: ' + text)
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setToast('تعذرت المشاركة الآن، حاول مرة أخرى.')
    }
  }

  const updateSettings = (changes) => setSettings((previous) => ({ ...previous, ...changes }))

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: 'home' },
    { id: 'categories', label: 'المعلومات', icon: 'library' },
    { id: 'competitions', label: 'المسابقات', icon: 'trophy' },
    { id: 'profile', label: 'تقدمي', icon: 'chart' },
    { id: 'settings', label: 'المزيد', icon: 'settings' },
  ]

  const confirmDialog = () => {
    const action = dialog?.onConfirm
    setDialog(null)
    action?.()
  }

  return (
    <div className={`app-shell theme--${settings.theme} ${settings.questionTextSize === 'large' ? 'text-scale--large' : ''} ${settings.reduceMotion ? 'reduce-motion' : ''}`}>
      {view !== 'quiz' && <AppBar view={view} level={level} points={stats.totalPoints} navigate={navigate} onSearch={focusCategorySearch} />}

      <main className={`app-content main-content app-content--${view}`}>
        {view === 'home' && <HomeView categories={categories} counts={categoryCounts} stats={stats} level={level} accuracy={accuracy} startGame={startGame} navigate={navigate} />}
        {view === 'categories' && <CategoriesView counts={categoryCounts} activeFilter={categoryFilter} setActiveFilter={setCategoryFilter} searchTerm={categorySearch} setSearchTerm={setCategorySearch} startGame={startGame} />}
        {view === 'competitions' && <CompetitionsView stats={stats} startGame={startGame} navigate={navigate} />}
        {view === 'profile' && <ProfileView stats={stats} level={level} progress={progress} accuracy={accuracy} counts={categoryCounts} startGame={startGame} />}
        {view === 'settings' && <SettingsView settings={settings} updateSettings={updateSettings} seenQuestionCount={stats.seenQuestionIds.length} unseenQuestionCount={unseenQuestionCount} resetQuestionHistory={resetQuestionHistory} resetProgress={resetProgress} />}
        {view === 'quiz' && session && <QuizView session={session} timerPaused={isTimerPaused} answerQuestion={answerQuestion} nextQuestion={nextQuestion} abandonSession={abandonSession} />}
        {view === 'results' && result && <ResultView result={result} startGame={startGame} navigate={navigate} onShare={() => shareResult(result)} />}
      </main>

      {isMainDestination && <BottomNavigation items={navItems} view={view} navigate={navigate} />}
      {toast && <div className="app-toast" role="status"><AppIcon name="check-circle" size={19} />{toast}</div>}
      <ConfirmDialog dialog={dialog} onCancel={() => setDialog(null)} onConfirm={confirmDialog} />
    </div>
  )
}

function AppSectionHeading({ eyebrow, title, action, onAction }) {
  return (
    <div className="section-heading">
      <div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>
      {action && <button type="button" className="section-heading__action" onClick={onAction}>{action}<AppIcon name="arrow" size={18} /></button>}
    </div>
  )
}

function HomeView({ categories: allCategories, counts, stats, level, accuracy, startGame, navigate }) {
  const featured = allCategories.slice(0, 6)
  const dailyDone = stats.dailyDate === todayKey() && stats.dailyBest > 0

  return (
    <div className="app-page home-screen">
      <section className="home-welcome">
        <div><small>مرحبًا بك في معارف</small><h1>جاهز لتحدٍ جديد؟</h1><p>خطوة معرفية صغيرة اليوم تصنع فرقًا كبيرًا.</p></div>
        <button className="level-chip" type="button" onClick={() => navigate('profile')} aria-label={`المستوى ${formatNumber(level)}، عرض التقدم`}><span>{formatNumber(level)}</span><small>مستوى</small></button>
      </section>

      <section className="daily-challenge-card">
        <div className="daily-challenge-card__art"><span className="daily-challenge-card__orbit" /><AppIcon name="bolt" size={30} /></div>
        <div className="daily-challenge-card__content">
          <div className="daily-challenge-card__label"><span>{dailyDone ? 'أنجزت تحدي اليوم' : 'تحدي اليوم'}</span>{dailyDone && <AppIcon name="check-circle" size={17} />}</div>
          <h2>{dailyDone ? `أفضل نتيجة: ${formatNumber(stats.dailyBest)} نقطة` : 'عشر أسئلة جديدة في ثلاث دقائق'}</h2>
          <p><span><AppIcon name="library" size={16} />١٠ أسئلة</span><span><AppIcon name="clock" size={16} />٣ دقائق</span></p>
          <button className="app-button app-button--on-primary" type="button" onClick={() => startGame({ mode: 'daily', count: 10, duration: 180, daily: true })}>{dailyDone ? 'جولة جديدة' : 'ابدأ التحدي'}<AppIcon name="arrow" size={19} /></button>
        </div>
      </section>

      <section className="app-section">
        <AppSectionHeading eyebrow="استكشف" title="اختر ما يثير فضولك" action="كل الفئات" onAction={() => navigate('categories')} />
        <div className="category-rail">
          {featured.map((category) => <CategoryCard key={category.id} category={category} count={counts[category.id]} onPractice={() => startGame({ mode: 'practice', category: category.id, count: 10 })} />)}
        </div>
      </section>

      <section className="app-section">
        <AppSectionHeading eyebrow="العب بطريقتك" title="مسابقات سريعة" action="عرض الكل" onAction={() => navigate('competitions')} />
        <div className="quick-challenge-list">
          <QuickChallenge icon="play" tone="violet" label="تدريب حر" title="استكشف العلوم بلا توقيت" meta="١٠ أسئلة" onClick={() => startGame({ mode: 'practice', category: 'science', count: 10 })} />
          <QuickChallenge icon="trophy" tone="mint" label="اختبار المعرفة" title="اختبار شامل من ١٥ سؤالًا" meta="٦ دقائق" onClick={() => startGame({ mode: 'test', count: 15, duration: 360 })} />
          <QuickChallenge icon="bolt" tone="amber" label="تحدي البرق" title="اختبر سرعتك قبل انتهاء الوقت" meta="٩٠ ثانية" onClick={() => startGame({ mode: 'sprint', count: 10, duration: 90 })} />
        </div>
      </section>

      <button className="home-progress-card" type="button" onClick={() => navigate('profile')}>
        <div className="home-progress-card__icon"><AppIcon name="chart" size={24} /></div>
        <div><small>تقدمك حتى الآن</small><strong>{formatNumber(stats.answered)} إجابة · {formatNumber(accuracy)}٪ دقة</strong></div>
        <AppIcon name="arrow" size={21} />
      </button>
    </div>
  )
}

function QuickChallenge({ icon, tone, label, title, meta, onClick }) {
  return (
    <button type="button" className={`quick-challenge quick-challenge--${tone}`} onClick={onClick}>
      <span className="quick-challenge__icon"><AppIcon name={icon} size={23} /></span>
      <span className="quick-challenge__content"><small>{label}</small><strong>{title}</strong><em>{meta}</em></span>
      <AppIcon name="arrow" size={20} />
    </button>
  )
}

function CategoryCard({ category, count, onPractice, onTest, detailed = false }) {
  return (
    <article className={`category-card ${detailed ? 'category-card--detailed' : 'category-card--compact'}`} style={{ '--accent': category.accent, '--glow': category.glow }}>
      <button className="category-card__main" type="button" onClick={onPractice} aria-label={`ابدأ تدريبًا في فئة ${category.title}`}>
        <span className="category-card__icon"><CategoryIcon category={category} size={detailed ? 27 : 24} /></span>
        <span className="category-card__text"><strong>{detailed ? category.title : category.shortTitle}</strong><small>{detailed ? category.description : `${formatNumber(count || 0)} سؤال`}</small></span>
        <AppIcon name="arrow" size={18} className="category-card__arrow" />
      </button>
      {detailed && <div className="category-card__actions"><button type="button" onClick={onPractice}>تدريب حر</button><button type="button" onClick={onTest}>اختبار سريع</button></div>}
    </article>
  )
}

function CategoriesView({ counts, activeFilter, setActiveFilter, searchTerm, setSearchTerm, startGame }) {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('ar')
  const visibleCategories = categories.filter((category) => {
    const matchesFilter = activeFilter === 'all' || category.id === activeFilter
    const searchable = `${category.title} ${category.shortTitle} ${category.description}`.toLocaleLowerCase('ar')
    return matchesFilter && (!normalizedSearch || searchable.includes(normalizedSearch))
  })

  return (
    <div className="app-page library-screen">
      <section className="page-heading"><small>أكثر من {formatNumber(questionBank.length)} سؤال</small><h1>المعلومات</h1><p>اختر تصنيفًا، ابحث فيه، ثم حوّل المعرفة إلى جولة قصيرة ممتعة.</p></section>
      <label className="app-search"><AppIcon name="search" size={21} /><input id="category-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="ابحث في الفئات" aria-label="ابحث في فئات المعلومات" />{searchTerm && <button type="button" aria-label="مسح البحث" onClick={() => setSearchTerm('')}><AppIcon name="close" size={18} /></button>}</label>

      <div className="filter-chips" aria-label="فلترة الفئات">
        <button type="button" className={activeFilter === 'all' ? 'is-active' : ''} onClick={() => setActiveFilter('all')}>الكل</button>
        {categories.map((category) => <button type="button" key={category.id} className={activeFilter === category.id ? 'is-active' : ''} onClick={() => setActiveFilter(category.id)}><CategoryIcon category={category} size={16} />{category.shortTitle}</button>)}
      </div>

      {visibleCategories.length ? <div className="category-library-grid">{visibleCategories.map((category) => <CategoryCard key={category.id} category={category} count={counts[category.id]} detailed onPractice={() => startGame({ mode: 'practice', category: category.id, count: 10 })} onTest={() => startGame({ mode: 'test', category: category.id, count: 15, duration: 300 })} />)}</div> : <EmptyState title="لا توجد فئات مطابقة" description="جرّب عبارة بحث أخرى أو اعرض جميع الفئات مرة أخرى." action="عرض الكل" onAction={() => { setSearchTerm(''); setActiveFilter('all') }} />}
    </div>
  )
}

function EmptyState({ title, description, action, onAction }) {
  return <section className="empty-state"><span><AppIcon name="search" size={28} /></span><h2>{title}</h2><p>{description}</p>{action && <button className="app-button app-button--tonal" type="button" onClick={onAction}>{action}</button>}</section>
}

function CompetitionsView({ stats, startGame, navigate }) {
  const dailyDone = stats.dailyDate === todayKey() && stats.dailyBest > 0
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0
  return (
    <div className="app-page competitions-screen">
      <section className="page-heading"><small>ساحة التحديات</small><h1>المسابقات</h1><p>اختر المدة التي تناسبك، واجمع النقاط بأسئلة جديدة في كل جولة.</p></section>

      <section className="competition-feature">
        <div className="competition-feature__header"><span className="competition-feature__icon"><AppIcon name="calendar" size={25} /></span><div><small>{dailyDone ? 'أنجزت تحدي اليوم' : 'تحدي اليوم'}</small><h2>{dailyDone ? `أفضل نتيجتك ${formatNumber(stats.dailyBest)} نقطة` : 'عودة يومية إلى المعرفة'}</h2></div>{dailyDone && <AppIcon name="check-circle" size={22} />}</div>
        <div className="competition-feature__details"><span><AppIcon name="library" size={17} />١٠ أسئلة</span><span><AppIcon name="clock" size={17} />٣ دقائق</span><span><AppIcon name="medal" size={17} />نقاط إضافية</span></div>
        <button type="button" className="app-button app-button--on-primary" onClick={() => startGame({ mode: 'daily', count: 10, duration: 180, daily: true })}>{dailyDone ? 'العب مرة أخرى' : 'ابدأ تحدي اليوم'}<AppIcon name="arrow" size={19} /></button>
      </section>

      <section className="app-section"><AppSectionHeading title="اختر مسابقتك" />
        <div className="competition-list">
          <ChallengeCard icon="bolt" tone="violet" label="تحدي البرق" title="١٠ أسئلة في ٩٠ ثانية" description="جلسة سريعة لاختبار تركيزك وسرعة قرارك." meta="نقاط سرعة" onStart={() => startGame({ mode: 'sprint', count: 10, duration: 90 })} />
          <ChallengeCard icon="trophy" tone="mint" label="اختبار المعرفة" title="١٥ سؤالًا متنوعًا" description="اختبار شامل من فئات معارف المختلفة." meta="٦ دقائق" onStart={() => startGame({ mode: 'test', count: 15, duration: 360 })} />
          <ChallengeCard icon="play" tone="blue" label="تدريب حر" title="تعلّم بلا عداد" description="خذ وقتك في التفكير واكتشف أسئلة جديدة." meta="١٠ أسئلة" onStart={() => startGame({ mode: 'practice', count: 10 })} />
        </div>
      </section>

      <section className="local-scoreboard"><div className="local-scoreboard__header"><div><small>لوحة النتائج المحلية</small><h2>أفضل إنجازاتك</h2></div><span><AppIcon name="medal" size={25} /></span></div><div className="local-scoreboard__metrics"><ScoreMetric icon="trophy" label="أفضل نتيجة" value={formatNumber(stats.bestScore)} /><ScoreMetric icon="spark" label="إجمالي النقاط" value={formatNumber(stats.totalPoints)} /><ScoreMetric icon="check-circle" label="دقة الإجابات" value={stats.answered ? `${formatNumber(accuracy)}٪` : '—'} /></div></section>

      <section className="online-coming-soon"><span><AppIcon name="library" size={23} /></span><div><small>قريبًا</small><h2>تحديات بين الأصدقاء</h2><p>تظل نتائجك محفوظة محليًا الآن، والواجهة جاهزة للمنافسات الجماعية عند ربط الخدمة المستقبلية.</p></div><button type="button" className="section-heading__action" onClick={() => navigate('profile')}>تقدمي<AppIcon name="arrow" size={17} /></button></section>
    </div>
  )
}

function ChallengeCard({ icon, tone, label, title, description, meta, onStart }) {
  return <article className={`challenge-card challenge-card--${tone}`}><div className="challenge-card__heading"><span><AppIcon name={icon} size={24} /></span><small>{label}</small></div><h3>{title}</h3><p>{description}</p><footer><span>{meta}</span><button className="app-button app-button--tonal" type="button" onClick={onStart}>ابدأ<AppIcon name="arrow" size={17} /></button></footer></article>
}

function ScoreMetric({ icon, label, value }) {
  return <div className="score-metric"><span><AppIcon name={icon} size={19} /></span><div><strong>{value}</strong><small>{label}</small></div></div>
}

function SettingsToggle({ icon, label, description, enabled, onToggle }) {
  return <div className="settings-row"><span className="settings-row__icon"><AppIcon name={icon} size={21} /></span><div className="settings-row__content"><b>{label}</b><p>{description}</p></div><button type="button" className={`app-switch ${enabled ? 'is-on' : ''}`} role="switch" aria-label={label} aria-checked={enabled} onClick={onToggle}><i aria-hidden="true" /></button></div>
}

function SettingsSegment({ icon, label, description, value, choices, onChange }) {
  return <div className="settings-segment-row"><span className="settings-row__icon"><AppIcon name={icon} size={21} /></span><div className="settings-row__content"><b>{label}</b><p>{description}</p><div className="settings-segment" role="group" aria-label={label}>{choices.map((choice) => <button key={choice.value} type="button" className={value === choice.value ? 'is-selected' : ''} aria-pressed={value === choice.value} onClick={() => onChange(choice.value)}>{choice.icon && <AppIcon name={choice.icon} size={15} />}{choice.label}</button>)}</div></div></div>
}

function SettingsView({ settings, updateSettings, seenQuestionCount, unseenQuestionCount, resetQuestionHistory, resetProgress }) {
  return (
    <div className="app-page settings-screen">
      <section className="page-heading"><small>تخصيص معارف</small><h1>الإعدادات</h1><p>تُحفظ كل اختياراتك على هذا الجهاز لتعود إلى التجربة التي تفضلها.</p></section>
      <div className="settings-groups">
        <section className="settings-group"><header><small>المظهر وإمكانية القراءة</small><h2>تجربة مريحة لك</h2></header><SettingsSegment icon="palette" label="نمط المظهر" description="اختر الألوان المناسبة لك." value={settings.theme} choices={[{ value: 'light', label: 'فاتح', icon: 'sun' }, { value: 'dark', label: 'داكن', icon: 'moon' }]} onChange={(theme) => updateSettings({ theme })} /><SettingsSegment icon="type" label="حجم نص الأسئلة" description="كبّر نص السؤال لقراءة أسهل." value={settings.questionTextSize} choices={[{ value: 'comfortable', label: 'مريح' }, { value: 'large', label: 'كبير' }]} onChange={(questionTextSize) => updateSettings({ questionTextSize })} /><SettingsToggle icon="motion" label="تقليل المؤثرات الحركية" description="أوقف الحركات غير الضرورية داخل التطبيق." enabled={settings.reduceMotion} onToggle={() => updateSettings({ reduceMotion: !settings.reduceMotion })} /></section>

        <section className="settings-group"><header><small>الجولات والإجابات</small><h2>وتيرة المسابقة</h2></header><SettingsToggle icon="forward" label="الانتقال التلقائي" description="انتقل إلى السؤال التالي بعد الإجابة." enabled={settings.autoAdvance} onToggle={() => updateSettings({ autoAdvance: !settings.autoAdvance })} /><SettingsSegment icon="clock" label="مدة الانتقال" description={settings.autoAdvance ? 'تبدأ بعد اختيار الإجابة.' : 'فعّل الانتقال التلقائي لاستخدام هذه المدة.'} value={String(settings.autoAdvanceSeconds)} choices={AUTO_ADVANCE_OPTIONS.map((seconds) => ({ value: String(seconds), label: `${formatNumber(seconds)} ث` }))} onChange={(seconds) => updateSettings({ autoAdvanceSeconds: Number(seconds) })} /></section>

        <section className="settings-group"><header><small>سجل التعلّم</small><h2>أسئلة جديدة دائمًا</h2></header><div className="history-overview"><span><AppIcon name="history" size={23} /></span><div><strong>{formatNumber(seenQuestionCount)} سؤال في سجلك</strong><p>يتبقى {formatNumber(unseenQuestionCount)} سؤال جديد في بنك معارف.</p></div></div><p className="settings-note">يُحجز السؤال عند بدء الجولة، لذلك لا يعود إليك في جلسة لاحقة حتى إن خرجت منها مبكرًا.</p><button className="app-button app-button--tonal settings-action" type="button" onClick={resetQuestionHistory}><AppIcon name="refresh" size={18} />إعادة إتاحة الأسئلة</button></section>

        <section className="settings-group settings-group--app"><header><small>تطبيق معارف</small><h2>التثبيت والبيانات</h2></header><div className="settings-install-guide" aria-label="طريقة تثبيت التطبيق"><span><AppIcon name="download" size={22} /></span><div><b>ثبّت معارف من قائمة المتصفح</b><p>Chrome أو Edge: افتح القائمة ثم اختر «تثبيت معارف» أو «إضافة إلى الشاشة الرئيسية».</p><p>آيفون وآيباد: افتح زر المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية».</p></div></div><button className="settings-danger" type="button" onClick={resetProgress}><AppIcon name="trash" size={18} />مسح النقاط والنتائج المحفوظة</button></section>
      </div>
    </div>
  )
}

function ProfileView({ stats, level, progress, accuracy, counts, startGame }) {
  const mostPracticed = [...categories]
    .map((category) => ({ category, ...stats.categoryStats?.[category.id], total: counts[category.id] || 0 }))
    .sort((first, second) => (second.answered || 0) - (first.answered || 0))
    .slice(0, 5)

  return (
    <div className="app-page profile-screen">
      <section className="player-card"><div className="player-card__top"><span className="player-card__avatar">م</span><div><small>ملف اللاعب</small><h1>مستكشف المعرفة</h1><p>تعلّم يومًا بعد يوم، والسجل محفوظ على جهازك.</p></div></div><div className="level-progress"><div className="level-progress__number"><b>{formatNumber(level)}</b><small>مستوى</small></div><div><span>المستوى {formatNumber(level)}</span><strong>كل إجابة صحيحة تقرّبك للمرحلة التالية</strong><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><small>{formatNumber(Math.round(progress * 9))} من ٩٠٠ نقطة</small></div></div></section>

      <section className="stat-grid"><StatCard icon="spark" value={formatNumber(stats.totalPoints)} label="إجمالي النقاط" tone="violet" /><StatCard icon="check-circle" value={`${formatNumber(accuracy)}٪`} label="دقة الإجابات" tone="mint" /><StatCard icon="trophy" value={formatNumber(stats.sessions)} label="جولات مكتملة" tone="amber" /><StatCard icon="calendar" value={formatNumber(stats.dailyBest)} label="أفضل تحدٍ يومي" tone="blue" /></section>

      <section className="profile-progress"><AppSectionHeading eyebrow="رحلتك التعليمية" title="الفئات التي استكشفتها" /><div className="progress-list">{mostPracticed.map(({ category, answered = 0, correct = 0 }) => { const value = answered ? Math.min(100, (correct / Math.max(answered, 1)) * 100) : 0; return <div className="progress-list__item" key={category.id}><span className="progress-list__icon" style={{ '--accent': category.accent }}><CategoryIcon category={category} size={21} /></span><div className="progress-list__body"><div><b>{category.title}</b><small>{formatNumber(answered)} إجابة · {formatNumber(correct)} صحيحة</small></div><div className="thin-progress"><i style={{ width: `${value}%`, background: category.accent }} /></div></div><button type="button" aria-label={`ابدأ جولة في ${category.title}`} onClick={() => startGame({ mode: 'practice', category: category.id, count: 10 })}><AppIcon name="play" size={17} /></button></div>})}</div></section>
    </div>
  )
}

function StatCard({ icon, value, label, tone }) {
  return <article className={`stat-card stat-card--${tone}`}><span><AppIcon name={icon} size={21} /></span><div><b>{value}</b><small>{label}</small></div></article>
}

function QuizView({ session, timerPaused, answerQuestion, nextQuestion, abandonSession }) {
  const current = session.questions[session.currentIndex]
  const currentCategory = categoryMap[current.category] || categoryMap.science
  const selected = session.selectedAnswer
  const isCorrect = selected && sameAnswer(selected, current.answer)
  const completedPercent = ((session.currentIndex + (selected ? 1 : 0)) / session.questions.length) * 100
  const modeLabel = { practice: 'تدريب حر', test: 'اختبار المعرفة', sprint: 'تحدي البرق', daily: 'تحدي اليوم' }[session.mode] || 'جلسة معرفة'
  const autoAdvancePercent = selected && session.autoAdvanceMs ? Math.max(0, Math.min(100, (session.autoAdvanceRemaining / session.autoAdvanceMs) * 100)) : 0
  const secondsToNext = Math.max(1, Math.ceil(session.autoAdvanceRemaining / 1000))
  const timerIsPaused = timerPaused && Boolean(session.duration)

  return (
    <div className="quiz-screen">
      <header className="quiz-app-bar quiz-header"><button type="button" className="quiz-close" onClick={abandonSession} aria-label="إنهاء المسابقة"><AppIcon name="close" size={23} /></button><div className="quiz-app-bar__title"><small>{modeLabel}</small><b>{currentCategory.title}</b></div><div className={`quiz-timer ${session.duration && session.secondsLeft <= 20 && !timerIsPaused ? 'is-urgent' : ''} ${timerIsPaused ? 'is-paused' : ''}`} aria-live="polite"><AppIcon name={timerIsPaused ? 'pause' : session.duration ? 'clock' : 'infinity'} size={18} /><span>{session.duration ? formatTime(session.secondsLeft) : 'بدون وقت'}</span></div></header>

      <main className="quiz-content app-page">
        <div className="quiz-progress-meta"><span>السؤال {formatNumber(session.currentIndex + 1)} من {formatNumber(session.questions.length)}</span><strong>{formatNumber(session.score)} نقطة</strong></div><div className="quiz-progress"><i style={{ width: `${completedPercent}%` }} /></div>

        <section className={`question-card ${selected ? (isCorrect ? 'is-correct' : 'is-wrong') : ''}`} data-difficulty={current.difficulty} data-question-id={current.id}>
          <div className="question-card__meta"><span className="question-category-icon" style={{ '--accent': currentCategory.accent }}><CategoryIcon category={currentCategory} size={21} /></span><span className={`difficulty-chip difficulty-chip--${current.difficulty}`}>{DIFFICULTY_LABELS[current.difficulty] || 'متوسط'}</span></div>
          <h1>{current.question}</h1>
          <div className="options-list options-grid" role="group" aria-label="خيارات الإجابة">
            {current.options.map((option, index) => {
              const optionValue = typeof option === 'string' ? option : option.value
              const optionLabel = typeof option === 'string' ? option : option.label
              const optionCorrect = sameAnswer(optionValue, current.answer)
              const optionSelected = sameAnswer(optionValue, selected)
              let className = 'option-button'
              if (selected) { if (optionCorrect) className += ' is-correct'; else if (optionSelected) className += ' is-wrong' }
              return <button key={`${optionValue}-${index}`} type="button" disabled={Boolean(selected)} aria-pressed={optionSelected} className={className} onClick={() => answerQuestion(optionValue)}><span className="option-button__letter">{LETTERS[index]}</span><b>{optionLabel}</b><span className="option-button__state">{selected && optionCorrect ? <AppIcon name="check" size={20} /> : selected && optionSelected ? <AppIcon name="close" size={19} /> : null}</span></button>
            })}
          </div>
          {selected && <div className={`answer-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`} role="status"><span><AppIcon name={isCorrect ? 'check-circle' : 'info'} size={23} /></span><div><b>{isCorrect ? 'إجابة صحيحة، أحسنت!' : 'الإجابة الصحيحة'}</b><p>{isCorrect ? <>أضفت نقاطًا جديدة إلى رصيدك.{current.answerKind === 'currency' && <> الاسم الرسمي للعملة: <strong>{current.answer}</strong>.</>}</> : <><strong>{current.answer}</strong></>}</p></div></div>}
          {selected && session.autoAdvanceEnabled && <div className="auto-advance" role="status" aria-live="polite"><div><span><AppIcon name="forward" size={17} />الانتقال إلى السؤال التالي</span><b>{timerPaused ? 'متوقف مؤقتًا' : `خلال ${formatNumber(secondsToNext)} ث`}</b></div><i><em style={{ width: `${autoAdvancePercent}%` }} /></i></div>}
          {selected && !session.autoAdvanceEnabled && <div className="manual-advance-note"><AppIcon name="info" size={18} />الانتقال اليدوي مفعّل. تابع عندما تكون جاهزًا.</div>}
        </section>
      </main>

      <footer className="quiz-bottom"><div>{selected ? <span>{session.duration ? 'سرعة إجابتك تمنحك نقاطًا إضافية' : 'خذ وقتك وفكّر بهدوء'}</span> : <span><AppIcon name="info" size={18} />اختر الإجابة التي تراها صحيحة</span>}</div>{selected && <button className="app-button app-button--primary" type="button" onClick={nextQuestion}>{session.currentIndex + 1 === session.questions.length ? 'عرض النتيجة' : 'السؤال التالي'}<AppIcon name="arrow" size={19} /></button>}</footer>
    </div>
  )
}

function ResultMetric({ icon, label, value }) {
  return <div className="result-metric"><span><AppIcon name={icon} size={21} /></span><div><b>{value}</b><small>{label}</small></div></div>
}

function ResultView({ result, startGame, navigate, onShare }) {
  const total = result.questions.length
  const percent = Math.round((result.correctCount / total) * 100)
  const incorrect = Math.max(0, result.answeredCount - result.correctCount)
  const elapsedSeconds = result.duration
    ? Math.max(0, result.duration - result.secondsLeft)
    : Math.max(0, Math.round(((result.finishedAt || Date.now()) - result.startedAt) / 1000))
  const title = percent >= 85 ? 'أداء مميز!' : percent >= 60 ? 'نتيجة قوية!' : 'جولة جيدة!'
  const category = result.category === 'all' ? null : categoryMap[result.category]

  return (
    <div className="result-screen app-page"><section className="result-hero"><button type="button" className="result-share" onClick={onShare} aria-label="مشاركة النتيجة"><AppIcon name="share" size={21} /></button><div className="result-hero__badge"><AppIcon name={percent >= 85 ? 'trophy' : 'medal'} size={37} /></div><small>{result.endReason === 'time' ? 'انتهى الوقت' : 'اكتملت الجولة'}</small><h1>{title}</h1><p>{category ? `أنهيت جولة في ${category.title}.` : 'أنهيت جولة متنوعة من بنك معارف.'}</p><div className="result-score"><b>{formatNumber(result.score)}</b><span>نقطة مكتسبة</span></div></section>
      <section className="result-metrics"><ResultMetric icon="check-circle" label="إجابات صحيحة" value={`${formatNumber(result.correctCount)} / ${formatNumber(total)}`} /><ResultMetric icon="wrong" label="إجابات غير صحيحة" value={formatNumber(incorrect)} /><ResultMetric icon="chart" label="نسبة النجاح" value={`${formatNumber(percent)}٪`} /><ResultMetric icon="clock" label="وقت الجولة" value={formatTime(elapsedSeconds)} /></section>
      <section className="result-actions"><button className="app-button app-button--primary" type="button" onClick={() => startGame(result.config)}><AppIcon name="refresh" size={19} />أعد المحاولة</button><button className="app-button app-button--tonal" type="button" onClick={() => navigate('categories')}>فئة أخرى<AppIcon name="arrow" size={19} /></button><button className="app-button app-button--text" type="button" onClick={() => navigate('home')}>العودة للرئيسية</button></section>
    </div>
  )
}

export default App
