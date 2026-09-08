import { useEffect, useMemo, useState } from 'react'
import questionBank from './data/questions.json'
import { categories, categoryMap } from './data/categories'

const LETTERS = ['أ', 'ب', 'ج', 'د']
const STORAGE_KEY = 'maaref-progress-v1'
const AUTO_ADVANCE_MS = 3_000

const emptyStats = {
  answered: 0,
  correct: 0,
  sessions: 0,
  totalPoints: 0,
  bestScore: 0,
  dailyBest: 0,
  dailyDate: '',
  categoryStats: {},
}

function readStats() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return { ...emptyStats, ...saved, categoryStats: saved.categoryStats || {} }
  } catch {
    return emptyStats
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
  return `${formatNumber(minutes)}:${String(seconds).padStart(2, '0')}`
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
    if (text.includes('أي نبي') || text.startsWith('من هو') || text.startsWith('من هي') || text.includes('أول البشر') || text.includes('زوجة آدم') || text.includes('ابن إبراهيم') || text.includes('أم النبي')) return 'religion-person'
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
  currency: ['الريال السعودي', 'الدينار الكويتي', 'الجنيه المصري', 'الدرهم الإماراتي', 'الين الياباني', 'اليورو', 'الدولار الأمريكي', 'الليرة التركية', 'الفرنك السويسري'],
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
  'religion-person': ['النبي محمد صلى الله عليه وسلم', 'نوح عليه السلام', 'إبراهيم عليه السلام', 'موسى عليه السلام', 'عيسى عليه السلام', 'يوسف عليه السلام', 'يونس عليه السلام', 'مريم عليها السلام'],
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

const enrichedQuestionBank = questionBank.map((question) => ({
  ...question,
  answerKind: inferAnswerKind(question),
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

function createRound(question, random) {
  const expected = String(question.answer).trim()
  const wrongOptions = shuffle(uniqueRelatedAnswers(question), random).slice(0, 3)
  return {
    ...question,
    // قد يظهر خياران أو ثلاثة فقط عندما لا توجد بدائل صحيحة من المجال نفسه؛ هذا أفضل من خيار غير ذي صلة.
    options: shuffle([expected, ...wrongOptions], random),
  }
}

function createQuestions({ category = 'all', count = 10, daily = false }) {
  const matching = enrichedQuestionBank.filter((question) => category === 'all' || question.category === category)
  const pool = matching.filter(isQuizReady).filter((question) => uniqueRelatedAnswers(question).length > 0)
  const random = daily ? seededRandom(`${todayKey()}-${category}-${count}`) : Math.random
  const selected = shuffle(pool, random).slice(0, Math.min(count, pool.length))
  return selected.map((question) => createRound(question, random))
}

function Icon({ children, className = '' }) {
  return <span className={`icon-glyph ${className}`} aria-hidden="true">{children}</span>
}

function Brand({ compact = false }) {
  return (
    <button className={`brand ${compact ? 'brand--compact' : ''}`} type="button" aria-label="العودة إلى الرئيسية">
      <span className="brand__mark" aria-hidden="true">
        <span className="brand__book">⌁</span>
        <span className="brand__spark">✦</span>
      </span>
      <span className="brand__word">معارف</span>
    </button>
  )
}

function App() {
  const [view, setView] = useState('home')
  const [stats, setStats] = useState(readStats)
  const [session, setSession] = useState(null)
  const [result, setResult] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [toast, setToast] = useState('')

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(categories.map((category) => [category.id, 0]))
    questionBank.forEach((question) => {
      counts[question.category] = (counts[question.category] || 0) + 1
    })
    return counts
  }, [])

  const level = Math.floor(stats.totalPoints / 900) + 1
  const progress = ((stats.totalPoints % 900) / 900) * 100
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  }, [stats])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const navigate = (nextView) => {
    setView(nextView)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startGame = ({ mode = 'practice', category = 'all', count = 10, duration = 0, daily = false } = {}) => {
    const rounds = createQuestions({ category, count, daily })
    if (!rounds.length) {
      setToast('لا توجد أسئلة كافية في هذه الفئة حاليًا.')
      return
    }
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
      autoAdvanceUntil: 0,
      autoAdvanceRemaining: 0,
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
    setSession(null)
    setResult(finished)
    navigate('results')
  }

  useEffect(() => {
    if (!session || !session.duration) return undefined
    if (session.secondsLeft <= 0) {
      finishSession('time')
      return undefined
    }
    const timer = window.setTimeout(() => {
      setSession((current) => current ? { ...current, secondsLeft: current.secondsLeft - 1 } : current)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [session?.secondsLeft, session?.duration])

  const answerQuestion = (answer) => {
    if (!session || session.selectedAnswer) return
    const current = session.questions[session.currentIndex]
    const correct = sameAnswer(answer, current.answer)
    const timeBonus = session.duration ? Math.min(50, Math.max(0, Math.floor(session.secondsLeft / 6))) : 0
    const earned = correct ? 100 + timeBonus : 0
    const autoAdvanceUntil = Date.now() + AUTO_ADVANCE_MS

    setSession((previous) => previous ? {
      ...previous,
      selectedAnswer: answer,
      autoAdvanceUntil,
      autoAdvanceRemaining: AUTO_ADVANCE_MS,
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

  // بعد الإجابة يبدأ عداد مرئي من خمس ثوان؛ يبقى زر «التالي» متاحًا للانتقال الفوري.
  useEffect(() => {
    if (!session?.selectedAnswer || !session.autoAdvanceUntil) return undefined

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
  }, [session?.selectedAnswer, session?.currentIndex, session?.autoAdvanceUntil])

  const abandonSession = () => {
    if (window.confirm('هل تريد إنهاء هذه الجلسة دون حفظ نتيجتها؟')) {
      setSession(null)
      navigate('home')
    }
  }

  const resetProgress = () => {
    if (window.confirm('سيتم مسح نقاطك ونتائجك المحفوظة على هذا الجهاز. هل تريد المتابعة؟')) {
      setStats(emptyStats)
      setToast('تم مسح التقدم المحفوظ.')
    }
  }

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: '⌂' },
    { id: 'categories', label: 'الفئات', icon: '◫' },
    { id: 'competitions', label: 'المسابقات', icon: '⚡' },
    { id: 'profile', label: 'تقدمي', icon: '◌' },
  ]

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />

      {view !== 'quiz' && (
        <header className="topbar">
          <div className="topbar__inner">
            <div onClick={() => navigate('home')} className="brand-wrap" role="presentation">
              <Brand />
            </div>
            <nav className="desktop-nav" aria-label="التنقل الرئيسي">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`nav-link ${view === item.id ? 'is-active' : ''}`}
                  onClick={() => navigate(item.id)}
                  type="button"
                >
                  <Icon>{item.icon}</Icon>
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="topbar__actions">
              <button className="flame-chip" type="button" onClick={() => navigate('profile')} title="نقاطك ومستواك">
                <span>✦</span>
                <strong>{formatNumber(stats.totalPoints)}</strong>
                <span className="hide-small">نقطة</span>
              </button>
              <button className="avatar" type="button" onClick={() => navigate('profile')} aria-label="عرض تقدمي">
                <span>{String(level).padStart(2, '0')}</span>
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={`main-content main-content--${view}`}>
        {view === 'home' && (
          <HomeView
            categories={categories}
            counts={categoryCounts}
            stats={stats}
            level={level}
            accuracy={accuracy}
            startGame={startGame}
            navigate={navigate}
          />
        )}
        {view === 'categories' && (
          <CategoriesView
            counts={categoryCounts}
            activeFilter={categoryFilter}
            setActiveFilter={setCategoryFilter}
            startGame={startGame}
          />
        )}
        {view === 'competitions' && (
          <CompetitionsView
            stats={stats}
            startGame={startGame}
            navigate={navigate}
          />
        )}
        {view === 'profile' && (
          <ProfileView
            stats={stats}
            level={level}
            progress={progress}
            accuracy={accuracy}
            counts={categoryCounts}
            resetProgress={resetProgress}
            startGame={startGame}
          />
        )}
        {view === 'quiz' && session && (
          <QuizView
            session={session}
            answerQuestion={answerQuestion}
            nextQuestion={nextQuestion}
            abandonSession={abandonSession}
          />
        )}
        {view === 'results' && result && (
          <ResultView result={result} startGame={startGame} navigate={navigate} />
        )}
      </main>

      {view !== 'quiz' && (
        <nav className="mobile-nav" aria-label="التنقل عبر الجوال">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`mobile-nav__item ${view === item.id ? 'is-active' : ''}`}
              onClick={() => navigate(item.id)}
              type="button"
            >
              <span>{item.icon}</span>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

function HomeView({ categories: allCategories, counts, stats, level, accuracy, startGame, navigate }) {
  const featured = allCategories.slice(0, 6)
  const dailyDone = stats.dailyDate === todayKey() && stats.dailyBest > 0

  return (
    <>
      <section className="hero page-width">
        <div className="hero__copy reveal">
          <span className="eyebrow"><span>✦</span> تعلّم، العب، وتقدّم كل يوم</span>
          <h1>كل سؤال يفتح<br /><em>نافذة معرفة.</em></h1>
          <p>منصة عربية تفاعلية تجمع آلاف الأسئلة في تجربة سريعة، جميلة، ومصممة لتناسبك أينما كنت.</p>
          <div className="hero__actions">
            <button className="button button--primary" type="button" onClick={() => startGame({ mode: 'test', count: 15, duration: 360 })}>
              ابدأ اختبارك <span>←</span>
            </button>
            <button className="button button--soft" type="button" onClick={() => startGame({ mode: 'daily', count: 10, duration: 180, daily: true })}>
              <span>⚡</span> تحدي اليوم
            </button>
          </div>
          <div className="hero__trust">
            <span className="avatars"><i>✦</i><i>🌍</i><i>🧠</i></span>
            <span><b>+10,000</b> سؤال عربي في انتظارك</span>
          </div>
        </div>

        <div className="hero__visual reveal reveal--late" aria-label="بطاقة عرض لتحدي يومي">
          <div className="orb orb--violet" />
          <div className="orb orb--mint" />
          <span className="floating floating--one">🌍</span>
          <span className="floating floating--two">✨</span>
          <span className="floating floating--three">🧠</span>
          <article className="hero-card">
            <div className="hero-card__head">
              <span className="hero-card__icon">⚡</span>
              <div><small>جرعة اليوم</small><strong>تحدّي المعرفة</strong></div>
              <span className="hero-card__more">•••</span>
            </div>
            <div className="hero-card__progress"><i /><i /><i className="is-empty" /><i className="is-empty" /></div>
            <p>أي كوكب يُعرف باسم <b>الكوكب الأحمر؟</b></p>
            <div className="hero-card__answer"><span>أ</span> المريخ <b>✓</b></div>
            <footer><span>+ 120 نقطة</span><span>01:28 ⏱</span></footer>
          </article>
          <div className="hero-score"><span>🏅</span><div><small>مستواك الحالي</small><b>المستوى {formatNumber(level)}</b></div></div>
        </div>
      </section>

      <section className="quick-strip page-width reveal">
        <div className="quick-strip__welcome">
          <span className="quick-strip__emoji">👋</span>
          <div><small>أهلًا بك في معارف</small><strong>هل أنت مستعد لجولة جديدة؟</strong></div>
        </div>
        <div className="quick-stat"><b>{formatNumber(stats.answered)}</b><span>إجابة</span></div>
        <div className="quick-stat"><b>{formatNumber(accuracy)}%</b><span>دقة إجاباتك</span></div>
        <div className="quick-stat"><b>{formatNumber(stats.sessions)}</b><span>اختبار مكتمل</span></div>
        <button type="button" className="text-button" onClick={() => navigate('profile')}>عرض تقدمي ←</button>
      </section>

      <section className="section page-width">
        <SectionHeading overline="استكشف عالمك" title="اختر فئة تناسب فضولك" action="كل الفئات" onAction={() => navigate('categories')} />
        <div className="category-grid category-grid--featured">
          {featured.map((category) => (
            <CategoryCard key={category.id} category={category} count={counts[category.id]} onStart={() => startGame({ mode: 'practice', category: category.id, count: 10 })} />
          ))}
        </div>
      </section>

      <section className="modes page-width section reveal">
        <div className="modes__content">
          <span className="eyebrow eyebrow--dark">مسارات لعب مرنة</span>
          <h2>تعلم بطريقتك،<br />وتابع تقدّمك بسهولة.</h2>
          <p>اختر تمرينًا هادئًا، اختبارًا شاملًا، أو سباقًا سريعًا ضد الوقت. تحفظ نتائجك تلقائيًا على جهازك.</p>
          <button className="button button--ink" type="button" onClick={() => navigate('competitions')}>استكشف المسابقات <span>←</span></button>
        </div>
        <div className="mode-stack">
          <button className="mode-card mode-card--one" type="button" onClick={() => startGame({ mode: 'practice', category: 'science', count: 10 })}>
            <span className="mode-card__emoji">🪄</span><div><small>تدريب حر</small><strong>استكشف بلا توقيت</strong></div><b>←</b>
          </button>
          <button className="mode-card mode-card--two" type="button" onClick={() => startGame({ mode: 'test', count: 15, duration: 360 })}>
            <span className="mode-card__emoji">🧠</span><div><small>اختبار المعلومات</small><strong>15 سؤالًا متنوعًا</strong></div><b>←</b>
          </button>
          <button className="mode-card mode-card--three" type="button" onClick={() => startGame({ mode: 'daily', count: 10, duration: 180, daily: true })}>
            <span className="mode-card__emoji">⚡</span><div><small>{dailyDone ? 'أنجزت تحدي اليوم' : 'تحدي اليوم'}</small><strong>{dailyDone ? `أفضل نتيجة: ${formatNumber(stats.dailyBest)}` : '10 أسئلة في 3 دقائق'}</strong></div><b>←</b>
          </button>
        </div>
      </section>

      <section className="cta-banner page-width reveal">
        <div><span>🎯</span><h2>المعرفة عادة صغيرة…<br />وأثرها كبير.</h2></div>
        <button type="button" className="button button--white" onClick={() => startGame({ mode: 'test', count: 15, duration: 360 })}>اختبر نفسك الآن ←</button>
      </section>
    </>
  )
}

function SectionHeading({ overline, title, action, onAction }) {
  return <div className="section-heading"><div><small>{overline}</small><h2>{title}</h2></div>{action && <button className="text-button" type="button" onClick={onAction}>{action} <span>←</span></button>}</div>
}

function CategoryCard({ category, count, onStart, detailed = false }) {
  return (
    <article className={`category-card ${detailed ? 'category-card--detailed' : ''}`} style={{ '--accent': category.accent, '--glow': category.glow }}>
      <div className="category-card__top"><span className="category-card__emoji">{category.emoji}</span><span className="category-card__dots">•••</span></div>
      <h3>{category.title}</h3>
      <p>{category.description}</p>
      <div className="category-card__bottom">
        <span>{formatNumber(count || 0)} سؤال</span>
        <button type="button" onClick={onStart} aria-label={`ابدأ فئة ${category.title}`}>ابدأ <b>←</b></button>
      </div>
      {detailed && <div className="category-card__detail-actions"><button type="button" onClick={onStart}>تدريب حر</button><button type="button" onClick={() => onStart('test')}>اختبار سريع</button></div>}
    </article>
  )
}

function CategoriesView({ counts, activeFilter, setActiveFilter, startGame }) {
  const visibleCategories = activeFilter === 'all' ? categories : categories.filter((category) => category.id === activeFilter)
  return (
    <div className="page-width page-intro">
      <span className="eyebrow"><span>🗂️</span> مكتبة المعرفة</span>
      <h1>فئات واسعة،<br /><em>وتحديات لا تنتهي.</em></h1>
      <p className="page-intro__lead">اختر المجال الذي تحبه، ثم ابدأ تدريبًا بلا وقت أو اختبارًا سريعًا يحسب نقاطك.</p>

      <div className="filter-row" aria-label="فلترة الفئات">
        <button type="button" className={activeFilter === 'all' ? 'is-active' : ''} onClick={() => setActiveFilter('all')}>الكل <span>{formatNumber(questionBank.length)}</span></button>
        {categories.map((category) => <button type="button" key={category.id} className={activeFilter === category.id ? 'is-active' : ''} onClick={() => setActiveFilter(category.id)}>{category.emoji} {category.shortTitle}</button>)}
      </div>

      <div className="category-grid category-grid--all">
        {visibleCategories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            count={counts[category.id]}
            detailed
            onStart={(mode) => startGame({ mode: mode === 'test' ? 'test' : 'practice', category: category.id, count: mode === 'test' ? 15 : 10, duration: mode === 'test' ? 300 : 0 })}
          />
        ))}
      </div>
    </div>
  )
}

function CompetitionsView({ stats, startGame, navigate }) {
  const dailyDone = stats.dailyDate === todayKey() && stats.dailyBest > 0
  return (
    <div className="page-width competitions-page">
      <section className="competition-hero">
        <div>
          <span className="eyebrow"><span>⚡</span> ساحة التحديات</span>
          <h1>وقت أقل،<br /><em>حماس أكثر.</em></h1>
          <p>اختبر سرعتك، اجمع النقاط، واصنع أفضل نتيجة شخصية. المنافسات الجماعية ستصل في المرحلة القادمة.</p>
        </div>
        <div className="competition-hero__timer"><span>⏱</span><b>01:30</b><small>هل تستطيع إنهاء الجولة؟</small></div>
      </section>

      <div className="challenge-grid">
        <ChallengeCard emoji="⚡" label="تحدي البرق" title="10 أسئلة في 90 ثانية" description="اختبار سريع من فئات متنوعة." meta="+ نقاط سرعة" color="violet" onStart={() => startGame({ mode: 'sprint', count: 10, duration: 90 })} />
        <ChallengeCard emoji="🎯" label="اختبار المعرفة" title="15 سؤالًا متنوعًا" description="اختبر رصيدك المعرفي في جلسة شاملة." meta="6 دقائق" color="mint" onStart={() => startGame({ mode: 'test', count: 15, duration: 360 })} />
        <ChallengeCard emoji="☀️" label={dailyDone ? 'أنجزت التحدي' : 'تحدي اليوم'} title={dailyDone ? `أفضل نتيجتك: ${formatNumber(stats.dailyBest)}` : '10 أسئلة جديدة كل يوم'} description="نفس الأسئلة خلال اليوم لتقارن نتائجك." meta="3 دقائق" color="sun" onStart={() => startGame({ mode: 'daily', count: 10, duration: 180, daily: true })} />
      </div>

      <section className="scoreboard section">
        <div className="scoreboard__head"><div><small>لوحة النتائج المحلية</small><h2>أفضل إنجازاتك على هذا الجهاز</h2></div><span>🏅</span></div>
        <div className="scoreboard__body">
          <div className="scoreboard__rank"><i>01</i><span className="scoreboard__avatar">أنت</span><div><b>أفضل نتيجة شخصية</b><small>واصل لتتجاوز رقمك</small></div><strong>{formatNumber(stats.bestScore)}</strong></div>
          <div className="scoreboard__rank"><i>✦</i><span className="scoreboard__avatar scoreboard__avatar--mint">م</span><div><b>إجمالي النقاط</b><small>كل إجابة صحيحة تقرّبك من مستوى جديد</small></div><strong>{formatNumber(stats.totalPoints)}</strong></div>
          <div className="scoreboard__rank"><i>✓</i><span className="scoreboard__avatar scoreboard__avatar--sun">%</span><div><b>دقة الإجابات</b><small>تعلم من الإجابة بعد كل سؤال</small></div><strong>{stats.answered ? `${formatNumber(Math.round((stats.correct / stats.answered) * 100))}%` : '—'}</strong></div>
        </div>
      </section>

      <section className="online-teaser reveal">
        <div className="online-teaser__badge">قريبًا</div>
        <div><span>🌐</span><h2>منافسات حقيقية بين الأصدقاء</h2><p>حسابات، غرف لعب خاصة، ولوحة صدارة مشتركة — الواجهة جاهزة للتوسع عند ربط قاعدة البيانات.</p></div>
        <button type="button" className="button button--soft" onClick={() => navigate('profile')}>تابع تقدّمك ←</button>
      </section>
    </div>
  )
}

function ChallengeCard({ emoji, label, title, description, meta, color, onStart }) {
  return <article className={`challenge-card challenge-card--${color}`}><span className="challenge-card__emoji">{emoji}</span><small>{label}</small><h3>{title}</h3><p>{description}</p><div><span>{meta}</span><button type="button" onClick={onStart}>ابدأ ←</button></div></article>
}

function ProfileView({ stats, level, progress, accuracy, counts, resetProgress, startGame }) {
  const mostPracticed = [...categories]
    .map((category) => ({ category, ...stats.categoryStats?.[category.id], total: counts[category.id] || 0 }))
    .sort((first, second) => (second.answered || 0) - (first.answered || 0))
    .slice(0, 5)

  return (
    <div className="page-width profile-page">
      <section className="profile-hero">
        <div className="profile-card">
          <div className="profile-card__person"><span>م</span><div><small>ملف اللاعب</small><h1>مستكشف المعرفة</h1></div><button type="button" onClick={resetProgress} title="مسح التقدم">⋯</button></div>
          <div className="level-row"><div className="level-ring" style={{ '--progress': `${progress * 3.6}deg` }}><b>{formatNumber(level)}</b><small>مستوى</small></div><div><span>المستوى {formatNumber(level)}</span><h2>كل إجابة صحيحة تصنع فرقًا</h2><div className="xp-bar"><i style={{ width: `${progress}%` }} /></div><small>{formatNumber(Math.round(progress * 9))} / 900 نقطة للمستوى التالي</small></div></div>
        </div>
        <div className="profile-quote"><span>“</span><p>العلم ليس حفظ إجابات، بل عادة سؤال لا تتوقف.</p><small>رسالة معارف اليومية ✦</small></div>
      </section>

      <section className="profile-stats">
        <StatCard icon="✦" value={formatNumber(stats.totalPoints)} label="إجمالي النقاط" tone="purple" />
        <StatCard icon="✓" value={`${formatNumber(accuracy)}%`} label="دقة إجاباتك" tone="green" />
        <StatCard icon="🏁" value={formatNumber(stats.sessions)} label="جولات مكتملة" tone="orange" />
        <StatCard icon="🔥" value={formatNumber(stats.dailyBest)} label="أفضل تحدٍ يومي" tone="pink" />
      </section>

      <section className="progress-card section">
        <SectionHeading overline="رحلتك التعليمية" title="الفئات التي استكشفتها" />
        <div className="progress-list">
          {mostPracticed.map(({ category, answered = 0, correct = 0, total }) => {
            const value = answered ? Math.min(100, (correct / Math.max(answered, 1)) * 100) : 0
            return <div className="progress-list__item" key={category.id}><span className="progress-list__emoji">{category.emoji}</span><div><div><b>{category.title}</b><small>{formatNumber(answered)} إجابة • {formatNumber(correct)} صحيحة</small></div><div className="thin-bar"><i style={{ width: `${value}%`, background: category.accent }} /></div></div><button type="button" onClick={() => startGame({ mode: 'practice', category: category.id, count: 10 })}>جولة ←</button></div>
          })}
        </div>
      </section>
    </div>
  )
}

function StatCard({ icon, value, label, tone }) {
  return <div className={`stat-card stat-card--${tone}`}><span>{icon}</span><div><b>{value}</b><small>{label}</small></div></div>
}

function QuizView({ session, answerQuestion, nextQuestion, abandonSession }) {
  const current = session.questions[session.currentIndex]
  const currentCategory = categoryMap[current.category] || categoryMap.science
  const selected = session.selectedAnswer
  const isCorrect = selected && sameAnswer(selected, current.answer)
  const completedPercent = ((session.currentIndex) / session.questions.length) * 100
  const modeLabel = {
    practice: 'تدريب حر',
    test: 'اختبار المعرفة',
    sprint: 'تحدي البرق',
    daily: 'تحدي اليوم',
  }[session.mode] || 'جلسة معرفة'
  const autoAdvancePercent = selected
    ? Math.max(0, Math.min(100, (session.autoAdvanceRemaining / AUTO_ADVANCE_MS) * 100))
    : 0
  const secondsToNext = Math.max(1, Math.ceil(session.autoAdvanceRemaining / 1000))

  return (
    <div className="quiz-shell">
      <header className="quiz-header page-width">
        <button type="button" className="quiz-exit" onClick={abandonSession}>× <span>إنهاء</span></button>
        <div className="quiz-category"><span>{currentCategory.emoji}</span><div><small>{modeLabel}</small><b>{currentCategory.title}</b></div></div>
        <div className={`quiz-timer ${session.duration && session.secondsLeft <= 20 ? 'is-urgent' : ''}`}><span>{session.duration ? '⏱' : '∞'}</span><b>{session.duration ? formatTime(session.secondsLeft) : 'بدون وقت'}</b></div>
      </header>

      <main className="quiz-content page-width">
        <div className="quiz-progress-row"><span>السؤال {formatNumber(session.currentIndex + 1)} من {formatNumber(session.questions.length)}</span><span>{formatNumber(session.score)} نقطة</span></div>
        <div className="quiz-progress"><i style={{ width: `${completedPercent}%` }} /></div>

        <section className={`question-card ${selected ? (isCorrect ? 'is-correct' : 'is-wrong') : ''}`}>
          <div className="question-card__top"><span className="question-number">{String(session.currentIndex + 1).padStart(2, '0')}</span><span className="question-emoji">{currentCategory.emoji}</span></div>
          <h1>{current.question}</h1>
          <div className="options-grid">
            {current.options.map((option, index) => {
              const optionCorrect = sameAnswer(option, current.answer)
              const optionSelected = sameAnswer(option, selected)
              let className = 'option-button'
              if (selected) {
                if (optionCorrect) className += ' is-correct'
                else if (optionSelected) className += ' is-wrong'
              }
              return <button key={`${option}-${index}`} type="button" disabled={Boolean(selected)} className={className} onClick={() => answerQuestion(option)}><span>{LETTERS[index]}</span><b>{option}</b><i>{selected && optionCorrect ? '✓' : selected && optionSelected ? '×' : ''}</i></button>
            })}
          </div>
          {selected && <div className={`answer-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`}><span>{isCorrect ? '🎉' : '💡'}</span><div><b>{isCorrect ? 'إجابة رائعة!' : 'ليست الإجابة الصحيحة هذه المرة.'}</b><p>{isCorrect ? 'أحسنت، أضفت نقاطًا جديدة إلى رصيدك.' : <>الإجابة الصحيحة: <strong>{current.answer}</strong></>}</p></div></div>}
          {selected && <div className="auto-advance" role="status" aria-live="polite"><div className="auto-advance__row"><span>سيتم الانتقال تلقائيًا إلى السؤال التالي</span><b>خلال {formatNumber(secondsToNext)} ثوانٍ</b></div><div className="auto-advance__bar"><i style={{ width: `${autoAdvancePercent}%` }} /></div></div>}
        </section>

        <div className="quiz-actions"><div><span>{session.duration ? 'سرعة إجابتك تمنحك نقاطًا إضافية' : 'خذ وقتك وفكّر بهدوء'}</span></div>{selected && <button className="button button--primary" type="button" onClick={nextQuestion}>{session.currentIndex + 1 === session.questions.length ? 'عرض النتيجة' : 'السؤال التالي'} <span>←</span></button>}</div>
      </main>
    </div>
  )
}

function ResultView({ result, startGame, navigate }) {
  const total = result.questions.length
  const percent = Math.round((result.correctCount / total) * 100)
  const title = percent >= 85 ? 'مذهل! أنت متألق.' : percent >= 60 ? 'نتيجة قوية، واصل.' : 'بداية جميلة، جرّب جولة أخرى.'
  const emoji = percent >= 85 ? '🏆' : percent >= 60 ? '🌟' : '🚀'
  const category = result.category === 'all' ? null : categoryMap[result.category]
  return <div className="result-page page-width"><section className="result-card"><div className="result-card__confetti">✦ ✧ · ✦</div><span className="result-card__emoji">{emoji}</span><small>{result.endReason === 'time' ? 'انتهى الوقت' : 'اكتملت الجولة'}</small><h1>{title}</h1><p>{category ? `أنهيت جولة في فئة ${category.title}.` : 'أنهيت جولة متنوعة من بنك معارف.'}</p><div className="result-score"><div><b>{formatNumber(result.score)}</b><span>نقطة</span></div><i /><div><b>{formatNumber(result.correctCount)} / {formatNumber(total)}</b><span>إجابة صحيحة</span></div><i /><div><b>{formatNumber(percent)}%</b><span>نسبة النجاح</span></div></div><div className="result-actions"><button className="button button--primary" type="button" onClick={() => startGame(result.config)}>أعد المحاولة <span>↻</span></button><button className="button button--soft" type="button" onClick={() => navigate('categories')}>فئة أخرى ←</button></div></section><section className="result-tip"><span>💡</span><div><b>نصيحة معارف</b><p>التكرار الذكي يصنع فرقًا: جرب فئة جديدة ثم عد إلى الفئة نفسها غدًا.</p></div></section></div>
}

export default App
