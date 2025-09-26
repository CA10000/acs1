// 从 sessionStorage 取数据
const questions = JSON.parse(sessionStorage.getItem('reviewQuestions') || '[]');
const answers   = JSON.parse(sessionStorage.getItem('reviewAnswers')   || '{}');

let showWrong = false;

function renderReview(){
  const box = document.getElementById('review-box');
  box.innerHTML = '';
  let correct = 0;

  questions.forEach(q=>{
    const userAns = answers[q.id] || '';
    const ok = userAns === q.answer;
    if (ok) correct++;
    if (showWrong && ok) return;          // 错题模式跳过对的

    const card = document.createElement('div');
    card.className = 'review-card ' + (ok?'':'wrong');

    card.innerHTML = `
      <h4>${q.number}. ${q.content}</h4>
      <div class="your-ans">你的答案：${userAns||'未作答'} ${
        ok ? '✓' : `<span style="color:#28a745"> 正确答案：${q.answer}</span>`
      }</div>
      <div class="exp">解析：${q.explanation}</div>
    `;
    box.appendChild(card);
  });

  document.getElementById('rev-total').textContent  = questions.length;
  document.getElementById('rev-correct').textContent= correct;
  document.getElementById('rev-rate').textContent   = Math.round(correct/questions.length*100);
}

function backToQuiz(){ location.href = 'index.html'; }
function wrongOnly(){ showWrong = true; renderReview(); }
function exportReview(){
  const lines = questions.map(q=>{
    const u = answers[q.id]||'未作答';
    return `#题目${q.number}\n##题目内容\n${q.content}\n##选项\n${q.options.join('\n')}\n##你的答案\n${u}\n##正确答案\n${q.answer}\n##解析\n${q.explanation}`;
  });
  download(lines.join('\n\n'),'review.txt');
}
// 工具函数
function download(content, filename){
  const blob = new Blob([content],{type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 入口
renderReview(); 