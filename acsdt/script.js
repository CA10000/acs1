/* ================= 脚本入口（完整替换 script.js） ================= */

let questions = [],               // 当前显示顺序的题目数组（可能被打乱）
    originalQuestions = [],       // 原始顺序备份（用于切回顺序模式）
    currentQuestionIndex = 0,
    userAnswers = {},
    mode = 'sequential';          // 'sequential' | 'random'

/* ================= DOM 快捷 ================= */
const $ = id => document.getElementById(id);
const uploadSec = $('upload-section'), quizSec = $('quiz-section'), resultSec = $('result-section');
const fileInput = $('file-input'), loading = $('loading'), container = $('questions-container');
const modeSelect = $('mode-select'); // 需要在 HTML 中加入 <select id="mode-select">（见下方示例）

/* ================= 页面加载：尝试恢复会话 ================= */
document.addEventListener('DOMContentLoaded', () => {
  if (!loadSavedQuiz()) {
    // 无保存数据，显示上传区（默认）
    switchSec('upload');
  } else {
    // 已恢复，UI在 loadSavedQuiz 中切换为 quiz
    console.log('已恢复上次题库与进度');
  }

  // 绑定模式控件（若存在）
  if (modeSelect) {
    modeSelect.value = mode;
    modeSelect.addEventListener('change', e => setMode(e.target.value));
  }
});

/* ================= 上传 ================= */
fileInput?.addEventListener('change', e => processFile(e.target.files[0]));
uploadSec?.addEventListener('drop', e => { e.preventDefault(); processFile(e.dataTransfer.files[0]); });
uploadSec?.addEventListener('dragover', e => e.preventDefault());

async function processFile(file) {
  if (!file) return;
  if (file.name.endsWith('.docx') && window.mammoth) {
    // 如果存在 mammoth，优先用它解析 docx
    loading?.classList.remove('hidden');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value;
      // 将HTML转成纯文本再解析（简单方式）
      const text = html.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').trim();
      questions = parseDocument(text);
    } catch (err) {
      alert('解析 docx 失败：' + err);
      loading?.classList.add('hidden');
      return;
    } finally {
      loading?.classList.add('hidden');
    }
  } else if (file.name.endsWith('.txt')) {
    // 读取 txt 文件
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        questions = parseDocument(evt.target.result);
        if (!questions || questions.length === 0) throw '未解析到题目';
      } catch (err) {
        alert('解析 txt 失败：' + err);
        return;
      }
    };
    reader.readAsText(file);
    // wait a tick for reader to finish (since we can't await FileReader here synchronously),
    // we'll wait on load event. To keep simple, use onload above and then continue in a timeout:
    await new Promise(resolve => { reader.onloadend = resolve; });
  } else {
    alert('请上传 .txt 或 .docx（支持 mammoth 转换）的文件');
    return;
  }

  if (!questions || questions.length === 0) {
    alert('未解析到题目，请检查文件格式');
    return;
  }

  // 新题库：保存原序并根据当前模式是否打乱
  originalQuestions = deepCopy(questions);
  if (mode === 'random') shuffleQuestions();
  beginNewQuiz(); // 初始化并进入答题
}

/* ================= 题库解析（与你原 parseDocument 类似） ================= */
function parseDocument(text) {
  const qs = [];
  const blocks = text.split(/^#题目\d+$/gm).slice(1);

  blocks.forEach((b, i) => {
    const content     = b.match(/##题目内容\s*\n([\s\S]*?)(?=##|$)/)?.[1]?.trim() || '';
    const optionsRaw  = b.match(/##选项\s*\n([\s\S]*?)(?=##|$)/)?.[1] || '';
    const answerRaw   = b.match(/##答案\s*\n([\s\S]*?)(?=##|$)/)?.[1] || '';
    const explanation = b.match(/##解析\s*\n([\s\S]*?)(?=##|$)/)?.[1]?.trim() || '';

    const answer = answerRaw.replace(/答案[:：]?\s*/g, '').trim().toUpperCase();
    const options = optionsRaw.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map((l, idx) => {
        const match = l.match(/^([A-D])[\.\、\s]?(.*)$/);
        if (match) return { key: match[1].toUpperCase(), text: match[2].trim() };
        // fallback：没有A.前缀则手动赋字母
        return { key: String.fromCharCode(65 + idx), text: l };
      });

    if (content && options.length && answer) qs.push({
      id: `q${i+1}`,
      number: i+1,
      content,
      options,
      answer,
      explanation
    });
  });

  return qs;
}

/* ================= 新题初始化（导入后调用） ================= */
function beginNewQuiz() {
  userAnswers = {};
  currentQuestionIndex = 0;
  phaseNo = 1;
  phaseLocked = false;

  persistSession();         // 保存会话
  $('total-questions').textContent = questions.length;
  $('answered-count').textContent = 0;
  switchSec('quiz');
  renderQuestions();
  showQuestion(0);
}

/* ================= 恢复题库（从 sessionStorage） ================= */
function loadSavedQuiz() {
  const qs = sessionStorage.getItem('quizQuestions');
  if (!qs) return false;
  try {
    questions = JSON.parse(qs);
    originalQuestions = JSON.parse(sessionStorage.getItem('originalQuestions') || JSON.stringify(questions));
    userAnswers = JSON.parse(sessionStorage.getItem('quizUserAnswers') || '{}');
    currentQuestionIndex = parseInt(sessionStorage.getItem('quizCurrentIndex') || '0', 10);
    phaseNo = parseInt(sessionStorage.getItem('quizPhaseNo') || '1', 10);
    mode = sessionStorage.getItem('quizMode') || 'sequential';

    // UI
    $('total-questions').textContent = questions.length;
    $('answered-count').textContent = Object.keys(userAnswers).length;
    switchSec('quiz');
    renderQuestions();
    showQuestion(Math.min(currentQuestionIndex, questions.length - 1));

    // 恢复各题选择状态（显示解析）
    for (let qid in userAnswers) {
      const val = userAnswers[qid];
      const input = document.querySelector(`input[name="${qid}"][value="${val}"]`);
      if (input) input.checked = true;
      // 展示解析（如果有）
      const q = questions.find(t => t.id === qid);
      if (q) {
        const box = $(`exp-${qid}`);
        if (box) {
          box.querySelector('.exp-text').textContent = q.explanation;
          box.classList.remove('hidden');
          box.classList.toggle('correct', val === q.answer);
          box.classList.toggle('wrong', val !== q.answer);
        }
      }
    }

    return true;
  } catch (err) {
    console.error('恢复题库失败', err);
    return false;
  }
}

/* ================= 渲染 / 题目卡片 ================= */
function renderQuestions() {
  container.innerHTML = '';
  questions.forEach((q, i) => container.appendChild(createCard(q, i)));
}

function createCard(q, idx) {
  const card = document.createElement('div');
  card.className = 'question-card';
  card.id = `card-${idx}`;
  card.style.display = idx ? 'none' : 'block';

  card.innerHTML = `
    <div class="question-title">${q.number}. ${escapeHtml(q.content)}</div>
    <div class="options-container">
      ${q.options.map(o => `
        <div class="option-item">
          <input type="radio" name="${q.id}" value="${o.key}" id="${q.id}-${o.key}" onchange="saveAnswer('${q.id}', this.value)">
          <label for="${q.id}-${o.key}">${o.key}. ${escapeHtml(o.text)}</label>
        </div>`).join('')}
    </div>
    <div class="explanation-box hidden" id="exp-${q.id}">
      <strong>解析：</strong><span class="exp-text"></span>
    </div>`;
  return card;
}

/* ================= 答题逻辑（保存并持久化） ================= */
function saveAnswer(qid, ans) {
  userAnswers[qid] = ans;
  $('answered-count').textContent = Object.keys(userAnswers).length;

  const q = questions.find(q => q.id === qid);
  const box = $(`exp-${qid}`);
  if (q && box) {
    box.querySelector('.exp-text').textContent = q.explanation;
    box.classList.remove('hidden');
    box.classList.toggle('correct', ans === q.answer);
    box.classList.toggle('wrong', ans !== q.answer);
  }

  persistSession();
  checkPhase();
}

/* ================= 翻页 ================= */
function showQuestion(idx) {
  if (idx < 0) idx = 0;
  if (idx >= questions.length) idx = questions.length - 1;
  document.querySelectorAll('.question-card').forEach((c, i) => c.style.display = (i === idx ? 'block' : 'none'));
  currentQuestionIndex = idx;
  persistSession(); // 保存当前题索引
}
function prevQuestion() { if (currentQuestionIndex > 0) showQuestion(currentQuestionIndex - 1); }
function nextQuestion() { if (currentQuestionIndex < questions.length - 1) showQuestion(currentQuestionIndex + 1); }

/* ================= 提交到复盘（不清 session） ================= */
function submitQuiz() {
  sessionStorage.setItem('reviewQuestions', JSON.stringify(questions));
  sessionStorage.setItem('reviewAnswers', JSON.stringify(userAnswers));
  // 提交后仍保留 quizQuestions，这样 review->返回仍然能恢复
  location.href = 'review.html';
}

/* ================= 阶段逻辑（原有） ================= */
let phaseNo = 1;
let phaseLocked = false;

function initPhase() {
  phaseNo = 1;
  phaseLocked = false;
}

function showPhaseModal() {
  const start = (phaseNo - 1) * 10;
  const end   = Math.min(start + 10, questions.length);
  let correct = 0;
  for (let i = start; i < end; i++) {
    const qid = questions[i].id;
    if (userAnswers[qid] && userAnswers[qid] === questions[i].answer) correct++;
  }
  $('phase-no').textContent      = phaseNo;
  $('phase-correct').textContent = correct;
  $('phase-rate').textContent    = Math.round(correct * 100 / (end - start));
  $('phase-modal').classList.remove('hidden');
}

function checkPhase() {
  if (phaseLocked) return;
  const start = (phaseNo - 1) * 10 + 1;
  const end   = start + 9;
  const curr = Object.keys(userAnswers).filter(k => {
    const num = parseInt(k.slice(1)); // q1 -> 1
    return num >= start && num <= end;
  });
  if (curr.length === 10) {
    phaseLocked = true;
    showPhaseModal();
  }
}

/* 阶段按钮（同原来逻辑） */
$('continue-btn')?.addEventListener('click', () => {
  $('phase-modal').classList.add('hidden');
  phaseLocked = false;
  const nextFirst = phaseNo * 10;
  if (nextFirst < questions.length) {
    showQuestion(nextFirst);
    phaseNo++;
    persistSession();
  } else {
    submitQuiz();
  }
});
$('submit-phase-btn')?.addEventListener('click', () => {
  $('phase-modal').classList.add('hidden');
  submitQuiz();
});
$('view-resume-btn')?.addEventListener('click', () => {
  $('phase-modal').classList.add('hidden');
  phaseLocked = false;
});

/* ================= 随机 / 顺序 切换功能 ================= */
function setMode(newMode) {
  if (newMode !== 'sequential' && newMode !== 'random') return;
  mode = newMode;
  sessionStorage.setItem('quizMode', mode);

  if (!originalQuestions || originalQuestions.length === 0) {
    // 如果没有备份，则把当前当做原始顺序
    originalQuestions = deepCopy(questions);
  }

  if (mode === 'random') {
    shuffleQuestions();
  } else {
    // 恢复到原始顺序
    questions = deepCopy(originalQuestions);
  }
  // 重新渲染并跳到第一题
  renderQuestions();
  showQuestion(0);
  persistSession();
}

function shuffleQuestions() {
  // Fisher-Yates
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
}

/* ================= 错题导出 / 成绩导出 / 保存加载 ================= */
function exportWrongQuestions() {
  const wrongs = [];
  questions.forEach(q => {
    const ua = userAnswers[q.id];
    if (ua && ua !== q.answer) {
      wrongs.push(q);
    }
  });
  if (!wrongs.length) { alert('没有错题！'); return; }
  const lines = wrongs.map(q => {
    const ua = userAnswers[q.id] || '未作答';
    return `题号：${q.number}\n题干：${q.content}\n你的答案：${ua}\n正确：${q.answer}\n解析：${q.explanation || ''}`;
  });
  downloadFile(lines.join('\n\n'), '错题本.txt');
}

function exportResult() {
  let correct = 0;
  questions.forEach(q => { if (userAnswers[q.id] === q.answer) correct++; });
  const pct = Math.round(correct * 100 / (questions.length || 1));
  let content = `成绩：${correct}/${questions.length} （${pct}%）\n\n详细：\n`;
  content += questions.map(q => {
    const ua = userAnswers[q.id] || '未作答';
    return `题号：${q.number}\n题干：${q.content}\n你的答案：${ua}\n正确：${q.answer}\n`;
  }).join('\n');
  downloadFile(content, '成绩单.txt');
}

/* 保存进度（手动/自动一起用 persistSession） */
function saveProgress() {
  persistSession();
  alert('进度已保存');
}
function loadProgress() {
  if (loadSavedQuiz()) alert('已恢复上次进度');
  else alert('无保存进度');
}
function clearSavedQuiz() {
  ['quizQuestions','originalQuestions','quizUserAnswers','quizCurrentIndex','quizPhaseNo','quizMode','reviewQuestions','reviewAnswers'].forEach(k => sessionStorage.removeItem(k));
  questions = []; originalQuestions = []; userAnswers = {}; currentQuestionIndex = 0; mode = 'sequential';
  alert('已清除保存数据，页面将刷新');
  location.reload();
}

/* ================= 会话持久化（自动保存） ================= */
function persistSession() {
  try {
    sessionStorage.setItem('quizQuestions', JSON.stringify(questions));
    sessionStorage.setItem('originalQuestions', JSON.stringify(originalQuestions));
    sessionStorage.setItem('quizUserAnswers', JSON.stringify(userAnswers));
    sessionStorage.setItem('quizCurrentIndex', String(currentQuestionIndex));
    sessionStorage.setItem('quizPhaseNo', String(phaseNo));
    sessionStorage.setItem('quizMode', mode);
  } catch (err) {
    console.warn('持久化失败', err);
  }
}

/* ================= 通用/工具 ================= */
function switchSec(sec) {
  ['upload','quiz','result'].forEach(s => $(s + '-section')?.classList.add('hidden'));
  $(sec + '-section')?.classList.remove('hidden');
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
