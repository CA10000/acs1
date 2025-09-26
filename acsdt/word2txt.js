/*****************************************************************
 *  Word → 本程序 txt 格式  2025-06
 *****************************************************************/
const wordInput = document.getElementById('word-input');
const wordArea  = document.getElementById('word-area');
const logBox    = document.getElementById('convert-log');

/* 1. 监听上传 */
wordInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  logBox.textContent = '正在解析 Word…';
  convertWord(file);
});

/* 2. 拖拽支持 */
wordArea.addEventListener('dragover', e => e.preventDefault());
wordArea.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.docx')) {
    logBox.textContent = '正在解析 Word…';
    convertWord(file);
  }
});

/* 3. 核心：Word → txt */
function convertWord(file) {
  const reader = new FileReader();
  reader.onload = async evt => {
    const arrayBuffer = evt.target.result;
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;                // Word 内容 HTML
    const txt  = extractQAP(html);            // 正则提取
    if (!txt) { logBox.textContent = '❌ 未识别到任何题目，请检查 Word 格式'; return; }
    download(txt, 'questions.txt');
    logBox.textContent = '✅ 转换成功！文件已自动下载，可直接上传到上方“选择文件”区域答题。';
    wordInput.value = '';                     // 允许重复上传同文件
  };
  reader.readAsArrayBuffer(file);
}

/* 4. 正则提取题库 */
function extractQAP(html) {
    // 1. 剥掉所有标签，只留纯文本
    const text = html.replace(/<[^>]+>/g, '\n')
                     .replace(/\n{2,}/g, '\n')
                     .trim();
  
    // 2. 按题号切分块  1.  2.  3. …
    const blocks = text.split(/(?=^\s*\d+\.\s+)/m);
  
    const out = [];
    blocks.forEach((blk, idx) => {
      if (!blk.trim()) return;
  
      // 2-1 抓题干   “1. 以下哪条命令……”
      const stemMatch = blk.match(/^\s*\d+\.\s*(.+?)(?=^[A-G]\.|正确答案|$)/ms);
      if (!stemMatch) return;
      let stem = stemMatch[1].replace(/\n/g, ' ').trim();
  
      // 2-2 抓选项   A. xxx  B. xxx …
      const opts = [];
      let optRe = /^[A-G]\.\s*(.+?)(?=[A-G]\.|正确答案|$)/gm, m;
      while ((m = optRe.exec(blk)) !== null) {
        opts.push(m[1].trim());
      }
  
      // 2-3 抓答案   正确答案: B
      const ansMatch = blk.match(/正确答案[:：]\s*([A-G])/i);
      if (!ansMatch) return;          // 答案缺失直接丢弃
      const ans = ansMatch[1].toUpperCase();
  
      // 2-4 抓解析   解析: xxxxxx
      const expMatch = blk.match(/解析[:：]\s*(.+?)(?=^\s*\d+\.|$)/is);
      const exp = expMatch ? expMatch[1].replace(/\n/g, ' ').trim() : '';
  
      // 2-5 拼装
      out.push(
        `#题目${idx + 1}`,
        `##题目内容`,
        stem,
        `##选项`,
        ...opts.map((o, i) => String.fromCharCode(65 + i) + '. ' + o),
        `##答案`,
        ans,
        `##解析`,
        exp
      );
    });
  
    return out.join('\n');
  }

/* 5. 浏览器下载 */
function download(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}