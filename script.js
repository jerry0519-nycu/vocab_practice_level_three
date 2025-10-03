/* ============================
   script.js - 單字練習主要邏輯
   - 讀取 words.txt (Tab 分隔)
   - 提供開始練習 / 隨機 / 依字母篩選
   - 顯示提示（開頭 + 結尾）
   - 儲存累積進度至 localStorage
   - 支援單字表頁面顯示與下載
   ============================ */

/* 全域變數 */
window.allWords = [];       // 所有單字 [{word, meaning}, ...]
let roundWords = [];        // 本輪題庫（陣列）
let currentIndex = 0;       // 本輪當前題目索引
let wrongWords = [];        // 本輪錯題清單（物件）
let roundSize = 0;          // 本輪題數
let isStarted = false;      // 是否已按開始
let isPracticingWrong = false; // 是否正在練習錯題模式
let isWaitingForIgnore = false; // 新增：是否等待忽略操作
let lastWrongWord = null;   // 新增：記錄最後答錯的單字
const PROGRESS_KEY = 'vocabProgress';
const ACTIVE_KEY = 'vocabActiveRound';
const MASTERED_WORDS_KEY = 'masteredWords'; // 新增：已掌握單字
const IGNORED_WORDS_KEY = 'ignoredWords'; // 新增：忽略的單字

/* 預設進度資料結構存在 localStorage */
function getSavedProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { totalSeen: 0, totalCorrect: 0 };
    return JSON.parse(raw);
  } catch (e) {
    return { totalSeen: 0, totalCorrect: 0 };
  }
}
function saveProgress(obj) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(obj));
}

/* 獲取已掌握的單字列表 */
function getMasteredWords() {
  try {
    const raw = localStorage.getItem(MASTERED_WORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/* 保存已掌握的單字列表 */
function saveMasteredWords(words) {
  localStorage.setItem(MASTERED_WORDS_KEY, JSON.stringify(words));
}

/* 將單字標記為已掌握 */
function markWordAsMastered(word) {
  const mastered = getMasteredWords();
  if (!mastered.includes(word)) {
    mastered.push(word);
    saveMasteredWords(mastered);
  }
}

/* 獲取忽略的單字列表 */
function getIgnoredWords() {
  try {
    const raw = localStorage.getItem(IGNORED_WORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/* 保存忽略的單字列表 */
function saveIgnoredWords(words) {
  localStorage.setItem(IGNORED_WORDS_KEY, JSON.stringify(words));
}

/* 將單字標記為忽略 */
function markWordAsIgnored(word) {
  const ignored = getIgnoredWords();
  if (!ignored.includes(word)) {
    ignored.push(word);
    saveIgnoredWords(ignored);
  }
}

/* active round（可儲存當前回合，重整可繼續） */
function saveActiveRound(data) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(data));
}
function loadActiveRound() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
function clearActiveRound() {
  localStorage.removeItem(ACTIVE_KEY);
}

/* 讀取 words.txt（Tab 分隔） */
function loadWordsFile() {
  // 顯示載入提示（若頁面有 loadingMsg）
  const loadingMsg = document.getElementById('loadingMsg');
  if (loadingMsg) loadingMsg.textContent = '正在載入單字，請稍候……';

  Papa.parse('words.txt', {
    download: true,
    header: true,
    skipEmptyLines: true,
    delimiter: "\t",
    complete: function(results) {
      // 把 BOM 移除並建構 allWords
      window.allWords = results.data.map(r => ({
        word: (r.word || '').replace(/^\uFEFF/, '').trim(),
        meaning: (r.meaning || '').trim()
      })).filter(x => x.word); // 只保留有單字的列

      // 如果頁面包含選單 filter，填入 A~Z
      populateFilterAlpha();

      // 若有儲存的 active round，恢復
      const active = loadActiveRound();
      if (active && active.roundWords && active.roundWords.length) {
        roundWords = active.roundWords;
        currentIndex = active.currentIndex || 0;
        wrongWords = active.wrongWords || [];
        roundSize = roundWords.length;
        isStarted = active.isStarted || false;
        isPracticingWrong = active.isPracticingWrong || false;
        isWaitingForIgnore = active.isWaitingForIgnore || false;
        lastWrongWord = active.lastWrongWord || null;
        updateCumulativeUI();
        if (isStarted) {
          showQuizArea();
          showCurrentQuestion();
        }
      } else {
        updateCumulativeUI();
      }

      // 若頁面為單字表，立即渲染
      if (typeof showWordListPage === 'function') {
        try { showWordListPage(); } catch(e){}
      }

      if (loadingMsg) loadingMsg.style.display = 'none';
    },
    error: function(err) {
      const loadingMsg = document.getElementById('loadingMsg');
      if (loadingMsg) loadingMsg.textContent = '單字載入失敗，請確認 words.txt 是否存在且為 Tab 分隔（UTF-8）。';
      console.error('載入單字失敗', err);
    }
  });
}

/* 在 filter select 中加入 A~Z（只做一次） */
function populateFilterAlpha() {
  const filterEl = document.getElementById('filter');
  const letterFilter = document.getElementById('letterFilter');
  if (!filterEl && !letterFilter) return;

  const letters = [];
  for (let i = 65; i <= 90; i++) letters.push(String.fromCharCode(i));
  // 清除已存在的 A~Z (避免重覆)
  const existing = new Set();
  if (filterEl) {
    Array.from(filterEl.options).forEach(o => existing.add(o.value));
  }
  letters.forEach(letter => {
    if (filterEl && !existing.has(letter)) {
      const opt = document.createElement('option');
      opt.value = letter;
      opt.textContent = `${letter} 開頭`;
      filterEl.appendChild(opt);
    }
    if (letterFilter && !existing.has(letter)) {
      const opt2 = document.createElement('option');
      opt2.value = letter;
      opt2.textContent = letter;
      letterFilter.appendChild(opt2);
    }
  });
}

/* 產生提示：開頭 + 中間底線 + 結尾，固定顯示5個底線 */
function makeHint(word) {
  if (!word) return '';
  word = word.trim();
  
  // 如果單字長度小於等於3，顯示第一個字母和最後一個字母，中間用底線
  if (word.length <= 3) {
    if (word.length === 1) return `${word[0]}`;
    if (word.length === 2) return `${word[0]}_`;
    return `${word[0]}_${word[word.length - 1]}`;
  }
  
  // 對於長度大於3的單字，固定顯示5個底線
  const fixedUnderscoreCount = 5;
  return `${word[0]}${'_'.repeat(fixedUnderscoreCount)}${word[word.length - 1]}`;
}

/* 隨機洗牌 (Fisher-Yates) */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 取出 pool（依 filter），排除已掌握和忽略的單字 */
function makePoolByFilter(filterValue) {
  if (!window.allWords || !window.allWords.length) return [];
  
  const masteredWords = getMasteredWords();
  const ignoredWords = getIgnoredWords();
  let pool = window.allWords.slice();
  
  // 排除已掌握和忽略的單字
  pool = pool.filter(w => !masteredWords.includes(w.word) && !ignoredWords.includes(w.word));
  
  if (filterValue === 'all') return pool;
  if (filterValue === 'random') return pool; // 隨機從全部抽題（抽取時再 shuffle）
  // letter
  return pool.filter(w => w.word && w.word[0] && w.word[0].toUpperCase() === filterValue);
}

/* 開始練習（按 Start） */
function startPractice() {
  const filter = document.getElementById('filter').value;
  const numQ = parseInt(document.getElementById('numQ').value) || 20;
  const pool = makePoolByFilter(filter);

  if (!pool.length) {
    alert('題庫為空或沒有符合篩選的單字。所有單字可能都已經掌握了或忽略了！');
    return;
  }

  // 檢查要求的題數是否超過可用單字數量
  if (numQ > pool.length) {
    const confirmProceed = confirm(
      `注意：您要求練習 ${numQ} 題，但符合條件的單字只有 ${pool.length} 個。\n\n` +
      `系統將自動調整為練習所有 ${pool.length} 個可用單字。\n` +
      `是否繼續？`
    );
    
    if (!confirmProceed) {
      return;
    }
  }

  // 建立本輪題庫
  let poolArr = pool.slice();

  // 若選 random，shuffle 並取前 numQ
  poolArr = shuffleArray(poolArr);
  const actualNumQ = Math.min(numQ, poolArr.length);
  roundWords = poolArr.slice(0, actualNumQ);
  roundSize = roundWords.length;
  currentIndex = 0;
  wrongWords = [];
  isStarted = true;
  isPracticingWrong = false;
  isWaitingForIgnore = false;
  lastWrongWord = null;

  // 如果實際題數少於要求題數，顯示提示
  if (actualNumQ < numQ) {
    setTimeout(() => {
      alert(`本輪實際練習 ${actualNumQ} 題（符合條件的單字數量不足）`);
    }, 500);
  }

  // 儲存 active round 到 localStorage（恢復用）
  saveActiveRound({
    roundWords,
    currentIndex,
    wrongWords,
    isStarted,
    isPracticingWrong,
    isWaitingForIgnore,
    lastWrongWord
  });

  // 顯示題目區、隱藏結果區
  showQuizArea();
  hideResultCard();
  showCurrentQuestion();
  updateCumulativeUI();
}

/* 顯示 quiz area */
function showQuizArea() {
  const quizCard = document.getElementById('quizCard');
  if (quizCard) quizCard.style.display = 'block';
  const setupCard = document.getElementById('setupCard');
  if (setupCard) setupCard.style.display = 'block';
  // 顯示 submit 按鈕
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.style.display = 'inline-block';
}

/* 隱藏 quiz area */
function hideQuizArea() {
  const quizCard = document.getElementById('quizCard');
  if (quizCard) quizCard.style.display = 'none';
}

/* 顯示當前題目（第 currentIndex 題） */
function showCurrentQuestion() {
  // 若還沒開始或 roundWords 空
  if (!isStarted || !roundWords || !roundWords.length) {
    document.getElementById('questionArea').style.display = 'none';
    return;
  }

  document.getElementById('questionArea').style.display = 'block';

  if (currentIndex >= roundWords.length) {
    // 回合結束
    onRoundComplete();
    return;
  }

  const q = roundWords[currentIndex];
  document.getElementById('qNumber').textContent = `題目 ${currentIndex + 1} / ${roundWords.length}`;
  document.getElementById('definition').textContent = q.meaning || '(無中文釋義)';
  
  // 修改提示顯示邏輯
  const hint = makeHint(q.word);
  const wordLength = q.word.length;
  let lengthInfo = '';
  
  document.getElementById('hint').textContent = `提示：${hint} ${lengthInfo}`;
  document.getElementById('answerInput').value = '';
  document.getElementById('feedback').textContent = '';

  // 重置按鈕狀態
  document.getElementById('continueBtn').style.display = 'none';
  document.getElementById('submitBtn').style.display = 'inline-block';
  document.getElementById('ignoreBtn').style.display = 'inline-block';

  // 更新 roundInfo
  const roundInfo = document.getElementById('roundInfo');
  if (roundInfo) {
    if (isPracticingWrong) {
      roundInfo.textContent = `（錯題練習：${roundWords.length} 題）`;
    } else {
      roundInfo.textContent = `（${roundWords.length} 題，每題單獨作答）`;
    }
  }

  // 更新本輪進度條
  updateRoundProgress();
  updateCumulativeUI();

  // 儲存 active round
  saveActiveRound({
    roundWords,
    currentIndex,
    wrongWords,
    isStarted,
    isPracticingWrong,
    isWaitingForIgnore,
    lastWrongWord
  });

  // 自動 focus 輸入框
  document.getElementById('answerInput').focus();
}

/* 提交答案檢查 */
function submitAnswer() {
  if (!isStarted || currentIndex >= roundWords.length) return;
  const userAns = (document.getElementById('answerInput').value || '').trim().toLowerCase();
  const current = roundWords[currentIndex];
  const correctWord = (current.word || '').toLowerCase();

  // 隱藏繼續按鈕（重置狀態）
  document.getElementById('continueBtn').style.display = 'none';
  document.getElementById('ignoreBtn').style.display = 'inline-block';

  // 只有在不是練習錯題模式時才更新累積進度
  if (!isPracticingWrong) {
    const prog = getSavedProgress();
    prog.totalSeen = (prog.totalSeen || 0) + 1;

    if (userAns === correctWord) {
      // 正確
      document.getElementById('feedback').innerHTML = `<span class="correct">✅ 答對！</span>`;
      prog.totalCorrect = (prog.totalCorrect || 0) + 1;
      // 標記為已掌握
      markWordAsMastered(current.word);
      
      // 儲存累積進度
      saveProgress(prog);
      
      // 正確時直接前進到下一題
      currentIndex++;
      saveActiveRound({ roundWords, currentIndex, wrongWords, isStarted, isPracticingWrong, isWaitingForIgnore: false, lastWrongWord: null });
      updateRoundProgress();
      updateCumulativeUI();
      
      // 延遲後顯示下一題
      setTimeout(() => {
        if (currentIndex < roundWords.length) {
          showCurrentQuestion();
        } else {
          onRoundComplete();
        }
      }, 900);
    } else {
      // 錯誤
      document.getElementById('feedback').innerHTML = `<span class="wrong">❌ 答錯，答案：${current.word}</span>`;
      wrongWords.push(current);
      
      // 記錄最後答錯的單字
      lastWrongWord = current;
      isWaitingForIgnore = true;
      
      // 儲存累積進度
      saveProgress(prog);
      
      // 錯誤時顯示繼續按鈕，隱藏提交按鈕
      document.getElementById('continueBtn').style.display = 'inline-block';
      document.getElementById('submitBtn').style.display = 'none';
      
      // 錯誤時停留在當前題目，等待使用者操作
      saveActiveRound({ roundWords, currentIndex, wrongWords, isStarted, isPracticingWrong, isWaitingForIgnore: true, lastWrongWord: current });
      updateRoundProgress();
      updateCumulativeUI();
      
      // 顯示提示訊息，告訴使用者可以忽略此題
      setTimeout(() => {
        document.getElementById('feedback').innerHTML += `<div class="mt-2 small text-info">如果這是拼寫變體（如 adviser/advisor），可以按「忽略此題」</div>`;
      }, 500);
    }
  } else {
    // 練習錯題模式：不計入累積進度，但記錄是否答對
    if (userAns === correctWord) {
      // 正確
      document.getElementById('feedback').innerHTML = `<span class="correct">✅ 答對！</span>`;
      // 在錯題模式中答對，從錯題列表中移除
      const indexInWrong = wrongWords.findIndex(w => w.word === current.word);
      if (indexInWrong > -1) {
        wrongWords.splice(indexInWrong, 1);
      }
      // 標記為已掌握
      markWordAsMastered(current.word);
      
      currentIndex++;
      saveActiveRound({ roundWords, currentIndex, wrongWords, isStarted, isPracticingWrong, isWaitingForIgnore: false, lastWrongWord: null });
      updateRoundProgress();
      updateCumulativeUI();
      
      setTimeout(() => {
        if (currentIndex < roundWords.length) {
          showCurrentQuestion();
        } else {
          onRoundComplete();
        }
      }, 900);
    } else {
      // 錯誤
      document.getElementById('feedback').innerHTML = `<span class="wrong">❌ 答錯，答案：${current.word}</span>`;
      // 確保單字在錯題列表中
      if (!wrongWords.some(w => w.word === current.word)) {
        wrongWords.push(current);
      }
      
      lastWrongWord = current;
      isWaitingForIgnore = true;
      
      // 錯誤時顯示繼續按鈕，隱藏提交按鈕
      document.getElementById('continueBtn').style.display = 'inline-block';
      document.getElementById('submitBtn').style.display = 'none';
      
      saveActiveRound({ roundWords, currentIndex, wrongWords, isStarted, isPracticingWrong, isWaitingForIgnore: true, lastWrongWord: current });
      updateRoundProgress();
      updateCumulativeUI();
      
      setTimeout(() => {
        document.getElementById('feedback').innerHTML += `<div class="mt-2 small text-info">如果這是拼寫變體（如 adviser/advisor），可以按「忽略此題」</div>`;
      }, 500);
    }
  }
}

/* 繼續下一題（單純答錯時使用） */
function continueToNext() {
  if (!isStarted || currentIndex >= roundWords.length) return;
  
  // 重置忽略狀態
  isWaitingForIgnore = false;
  lastWrongWord = null;
  
  // 恢復按鈕狀態
  document.getElementById('continueBtn').style.display = 'none';
  document.getElementById('submitBtn').style.display = 'inline-block';
  document.getElementById('ignoreBtn').style.display = 'inline-block';
  
  // 前進到下一題
  currentIndex++;
  saveActiveRound({ roundWords, currentIndex, wrongWords, isStarted, isPracticingWrong, isWaitingForIgnore: false, lastWrongWord: null });
  updateRoundProgress();
  updateCumulativeUI();

  if (currentIndex < roundWords.length) {
    showCurrentQuestion();
  } else {
    onRoundComplete();
  }
}

/* 忽略此題（在答錯後使用，將錯誤改為正確） */
function ignoreQuestion() {
  if (!isWaitingForIgnore || !lastWrongWord) {
    alert('此功能只能在答錯後使用。請先答題，如果答錯後可以選擇忽略。');
    return;
  }

  // 標記為忽略
  markWordAsIgnored(lastWrongWord.word);
  
  // 從錯題列表中移除
  const wrongIndex = wrongWords.findIndex(w => w.word === lastWrongWord.word);
  if (wrongIndex > -1) {
    wrongWords.splice(wrongIndex, 1);
  }
  
  // 更新累積進度：將之前的錯誤改為正確
  if (!isPracticingWrong) {
    const prog = getSavedProgress();
    // 之前已經計為 totalSeen +1 和 totalCorrect +0（因為答錯）
    // 現在要改為 totalCorrect +1
    prog.totalCorrect = (prog.totalCorrect || 0) + 1;
    saveProgress(prog);
  }

  // 重置狀態
  isWaitingForIgnore = false;
  
  // 恢復按鈕狀態
  document.getElementById('continueBtn').style.display = 'none';
  document.getElementById('submitBtn').style.display = 'inline-block';
  document.getElementById('ignoreBtn').style.display = 'inline-block';
  
  // 更新顯示
  document.getElementById('feedback').innerHTML = `<span class="correct">✅ 已忽略單字 "${lastWrongWord.word}"（改為答對）</span>`;
  updateCumulativeUI();
  
  // 前進到下一題
  currentIndex++;
  
  // 儲存 active round
  saveActiveRound({ roundWords, currentIndex, wrongWords, isStarted, isPracticingWrong, isWaitingForIgnore: false, lastWrongWord: null });

  // 延遲後顯示下一題
  setTimeout(() => {
    if (currentIndex < roundWords.length) {
      showCurrentQuestion();
    } else {
      onRoundComplete();
    }
  }, 1500);
}

/* 跳過題目（當作錯誤） */
function skipQuestion() {
  if (!isStarted || currentIndex >= roundWords.length) return;
  const current = roundWords[currentIndex];
  
  // 只有在不是練習錯題模式時才更新累積進度
  if (!isPracticingWrong) {
    const prog = getSavedProgress();
    prog.totalSeen = (prog.totalSeen || 0) + 1;
    // 視為錯誤
    wrongWords.push(current);
    saveProgress(prog);
  } else {
    // 練習錯題模式：只記錄錯題，不計入累積進度
    if (!wrongWords.some(w => w.word === current.word)) {
      wrongWords.push(current);
    }
  }

  currentIndex++;
  saveActiveRound({ roundWords, currentIndex, wrongWords, isStarted, isPracticingWrong, isWaitingForIgnore: false, lastWrongWord: null });
  updateRoundProgress();
  updateCumulativeUI();

  if (currentIndex < roundWords.length) {
    showCurrentQuestion();
  } else {
    onRoundComplete();
  }
}

/* 本輪完成時處理 */
function onRoundComplete() {
  // 顯示結果卡
  document.getElementById('resultCard').style.display = 'block';
  const summary = document.getElementById('resultSummary');
  const prog = getSavedProgress();
  
  if (isPracticingWrong) {
    summary.innerHTML = `<p>錯題練習已完成。剩餘錯誤題數：<strong>${wrongWords.length}</strong>。</p>`;
  } else {
    summary.innerHTML = `<p>本輪已完成。錯誤題數：<strong>${wrongWords.length}</strong>。累積答題總數：${prog.totalSeen}，累積答對：${prog.totalCorrect}。</p>`;
  }

  const wrongListDiv = document.getElementById('wrongList');
  if (wrongWords.length) {
    wrongListDiv.innerHTML = `<div class="small">錯題清單（建議按「只練錯題」繼續練習）:</div><ul>${wrongWords.map(w => `<li>${w.word} — ${w.meaning}</li>`).join('')}</ul>`;
    document.getElementById('practiceWrongBtn').style.display = 'inline-block';
  } else {
    if (isPracticingWrong) {
      wrongListDiv.innerHTML = `<div class="small">恭喜！所有錯題都已經掌握！</div>`;
    } else {
      wrongListDiv.innerHTML = `<div class="small">恭喜！本輪全部答對。</div>`;
    }
    document.getElementById('practiceWrongBtn').style.display = 'none';
  }

  // 隱藏題目區（但保留 UI）
  isStarted = false;
  isPracticingWrong = false;
  isWaitingForIgnore = false;
  lastWrongWord = null;
  // 清除 active round（本輪已結束）
  clearActiveRound();
}

/* 下一輪只練錯題 */
function practiceWrong() {
  if (!wrongWords.length) {
    alert('目前沒有錯題可以練習。');
    return;
  }
  roundWords = wrongWords.slice();
  wrongWords = [];
  currentIndex = 0;
  roundSize = roundWords.length;
  isStarted = true;
  isPracticingWrong = true; // 標記為錯題練習模式
  isWaitingForIgnore = false;
  lastWrongWord = null;
  
  // 儲存 active round
  saveActiveRound({ 
    roundWords, 
    currentIndex, 
    wrongWords, 
    isStarted, 
    isPracticingWrong,
    isWaitingForIgnore: false,
    lastWrongWord: null
  });

  // 隱藏結果 card，顯示 quiz
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('practiceWrongBtn').style.display = 'none';
  showQuizArea();
  showCurrentQuestion();
}

/* 下載錯題 CSV */
function downloadWrongCSV() {
  if (!wrongWords.length) {
    alert('沒有錯題可供下載');
    return;
  }
  // 使用 BOM 解決中文亂碼問題
  const csv = Papa.unparse(wrongWords.map(w => ({ word: w.word, meaning: w.meaning })));
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wrong_words.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* 開始新一輪（讓使用者重新設定） */
function startNewRoundPrompt() {
  if (isStarted) {
    if (!confirm('目前有進行中的輪次，確定要放棄並開始新一輪嗎？（會清除本輪資料）')) return;
  }
  // 清除 active round 並顯示設定
  clearActiveRound();
  isStarted = false;
  isPracticingWrong = false;
  isWaitingForIgnore = false;
  lastWrongWord = null;
  roundWords = [];
  wrongWords = [];
  currentIndex = 0;
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('quizCard').style.display = 'block';
  document.getElementById('submitBtn').style.display = 'none';
  updateCumulativeUI();
}

/* 更新本輪進度條 */
function updateRoundProgress() {
  const bar = document.getElementById('roundProgress');
  if (!bar) return;
  if (!roundWords || !roundWords.length) {
    bar.style.width = '0%';
    bar.textContent = '0%';
    document.getElementById('roundStats').textContent = '';
    return;
  }
  const percent = Math.round(((currentIndex) / roundWords.length) * 100);
  bar.style.width = `${percent}%`;
  bar.textContent = `${percent}%`;
  document.getElementById('roundStats').textContent = `本題進度：${Math.min(currentIndex, roundWords.length)}/${roundWords.length}`;
}

/* 更新累積（所有練習）進度顯示 */
function updateCumulativeUI() {
  const statEl = document.getElementById('cumulativeStats');
  const accBar = document.getElementById('accProgress');
  const prog = getSavedProgress();
  const totalSeen = prog.totalSeen || 0;
  const totalCorrect = prog.totalCorrect || 0;
  const acc = totalSeen ? Math.round((totalCorrect / totalSeen) * 100) : 0;
  
  // 顯示已掌握單字和忽略單字數量
  const masteredWords = getMasteredWords();
  const ignoredWords = getIgnoredWords();
  const masteredCount = masteredWords.length;
  const ignoredCount = ignoredWords.length;
  const totalWords = window.allWords.length;
  const masteryPercent = totalWords ? Math.round((masteredCount / totalWords) * 100) : 0;
  
  if (statEl) {
    statEl.innerHTML = `已答 ${totalSeen} 題，正確 ${totalCorrect} 題，正確率 ${acc}%<br>
                       已掌握 ${masteredCount}/${totalWords} 單字 (${masteryPercent}%)<br>
                       已忽略 ${ignoredCount} 個單字`;
  }
  if (accBar) {
    accBar.style.width = `${acc}%`;
    accBar.textContent = `${acc}%`;
  }
}

/* 重新設定並清除累積進度 */
function resetAllProgress() {
  if (!confirm('確定要清除所有累積進度、已掌握單字、忽略單字與本輪資料？此操作無法還原。')) return;
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem(MASTERED_WORDS_KEY);
  localStorage.removeItem(IGNORED_WORDS_KEY);
  clearActiveRound();
  // 重置內存
  roundWords = [];
  wrongWords = [];
  currentIndex = 0;
  isStarted = false;
  isPracticingWrong = false;
  isWaitingForIgnore = false;
  lastWrongWord = null;
  updateCumulativeUI();
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('quizCard').style.display = 'none';
  document.getElementById('questionsArea').innerHTML = '';
  alert('進度已重設。');
}

/* 顯示/更新單字表頁面（words.html 使用） */
function showWordListPage() {
  const area = document.getElementById('tableArea');
  if (!area) return;
  const search = document.getElementById('searchBox') ? document.getElementById('searchBox').value.trim().toLowerCase() : '';
  const letterFilter = document.getElementById('letterFilter') ? document.getElementById('letterFilter').value : 'all';

  let data = window.allWords.slice();
  if (letterFilter && letterFilter !== 'all') {
    data = data.filter(w => w.word && w.word[0] && w.word[0].toUpperCase() === letterFilter);
  }
  if (search) {
    // 修改搜尋邏輯：只搜尋以搜尋詞開頭的單字
    data = data.filter(w => w.word && w.word.toLowerCase().startsWith(search));
  }

  // 標記已掌握和忽略的單字
  const masteredWords = getMasteredWords();
  const ignoredWords = getIgnoredWords();
  data = data.map(word => ({
    ...word,
    mastered: masteredWords.includes(word.word),
    ignored: ignoredWords.includes(word.word)
  }));

  // build html table
  if (!data.length) {
    area.innerHTML = '<div class="text-muted">找不到符合條件的單字。</div>';
    return;
  }

  const rows = data.map(d => {
    let badges = '';
    if (d.mastered) {
      badges += '<span class="badge bg-success ms-2">已掌握</span>';
    }
    if (d.ignored) {
      badges += '<span class="badge bg-warning ms-2">已忽略</span>';
    }
    return `<tr>
      <td>${escapeHtml(d.word)}${badges}</td>
      <td>${escapeHtml(d.meaning)}</td>
    </tr>`;
  }).join('');
  
  area.innerHTML = `<table class="table table-striped"><thead><tr><th>單字</th><th>中文 / 詞性</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* 下載搜尋結果單字 CSV */
function downloadSearchResultsCSV() {
  const search = document.getElementById('searchBox') ? document.getElementById('searchBox').value.trim().toLowerCase() : '';
  const letterFilter = document.getElementById('letterFilter') ? document.getElementById('letterFilter').value : 'all';

  let data = window.allWords.slice();
  if (letterFilter && letterFilter !== 'all') {
    data = data.filter(w => w.word && w.word[0] && w.word[0].toUpperCase() === letterFilter);
  }
  if (search) {
    data = data.filter(w => w.word && w.word.toLowerCase().startsWith(search));
  }

  if (!data.length) {
    alert('沒有符合條件的單字可供下載。');
    return;
  }

  // 使用 BOM 解決中文亂碼問題
  const csv = Papa.unparse(data.map(w => ({ word: w.word, meaning: w.meaning })));
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  // 根據搜尋條件設定檔案名稱
  let filename = 'vocabulary';
  if (search) {
    filename += `_${search}`;
  }
  if (letterFilter !== 'all') {
    filename += `_${letterFilter}`;
  }
  a.download = `${filename}.csv`;
  
  a.click();
  URL.revokeObjectURL(url);
}

/* HTML escape */
function escapeHtml(unsafe) {
  return (unsafe || '').replace(/[&<>"'`=\/]/g, function(s) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}

/* 隱藏結果卡片 */
function hideResultCard() {
  const resultCard = document.getElementById('resultCard');
  if (resultCard) resultCard.style.display = 'none';
}

/* 綁定事件（在 DOMContentLoaded） */
document.addEventListener('DOMContentLoaded', () => {
  // 載入單字檔
  loadWordsFile();

  // filter 下拉
  const filterEl = document.getElementById('filter');
  if (filterEl) {
    // populateFilterAlpha will append the options after words loaded
  }

  // Start button
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', startPractice);

  // submit & skip & ignore & continue
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitAnswer);
  const skipBtn = document.getElementById('skipBtn');
  if (skipBtn) skipBtn.addEventListener('click', skipQuestion);
  const ignoreBtn = document.getElementById('ignoreBtn');
  if (ignoreBtn) ignoreBtn.addEventListener('click', ignoreQuestion);
  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) continueBtn.addEventListener('click', continueToNext);

  // practice wrong
  const practiceWrongBtn = document.getElementById('practiceWrongBtn');
  if (practiceWrongBtn) practiceWrongBtn.addEventListener('click', practiceWrong);

  // reset progress
  const resetBtn = document.getElementById('resetProgressBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetAllProgress);

  // start new round button in result card
  const startNewBtn = document.getElementById('startNewBtn');
  if (startNewBtn) startNewBtn.addEventListener('click', startNewRoundPrompt);

  // download wrong
  const downloadWrongBtn = document.getElementById('downloadWrongBtn');
  if (downloadWrongBtn) downloadWrongBtn.addEventListener('click', downloadWrongCSV);

  // Keyboard: Enter submits
  const answerInput = document.getElementById('answerInput');
  if (answerInput) {
    answerInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (document.getElementById('submitBtn').style.display !== 'none') submitAnswer();
      }
    });
  }

  // words.html controls
  const letterFilter = document.getElementById('letterFilter');
  if (letterFilter) {
    populateFilterAlpha();
    letterFilter.addEventListener('change', showWordListPage);
  }
  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.addEventListener('input', showWordListPage);
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  if (downloadAllBtn) downloadAllBtn.addEventListener('click', downloadSearchResultsCSV);

  // If there is saved active round and not started, we can offer to resume (optional)
  const active = loadActiveRound();
  if (active && active.roundWords && active.roundWords.length) {
    // Show a small resume prompt (if on index.html)
    const loadingMsg = document.getElementById('loadingMsg');
    if (loadingMsg) {
      loadingMsg.style.display = 'block';
      loadingMsg.innerHTML = `偵測到上一次未完成的輪次，可按 <a href="#" id="resumeLink">恢復練習</a>。`;
      const resumeLink = document.getElementById('resumeLink');
      if (resumeLink) {
        resumeLink.addEventListener('click', function(e) {
          e.preventDefault();
          // Restore active round values
          roundWords = active.roundWords;
          currentIndex = active.currentIndex || 0;
          wrongWords = active.wrongWords || [];
          isStarted = active.isStarted || true;
          isPracticingWrong = active.isPracticingWrong || false;
          isWaitingForIgnore = active.isWaitingForIgnore || false;
          lastWrongWord = active.lastWrongWord || null;
          document.getElementById('loadingMsg').style.display = 'none';
          showQuizArea();
          showCurrentQuestion();
          updateCumulativeUI();
        });
      }
    }
  }
});