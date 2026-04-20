const DEFAULT_TEST_DURATION_SECONDS = 60;
const DEFAULT_PASS_THRESHOLD = 40;
const RECORDS_STORAGE_KEY = "chinese-typing-test-records-v1";
const SETTINGS_STORAGE_KEY = "chinese-typing-test-settings-v1";

const passages = [
  "面试中的打字测试并不是为了刻意增加压力，而是为了观察候选人在有限时间里能否保持稳定节奏、准确输入和及时修正错误的能力。请先确认自己已经切换到中文输入法，再以自然速度完成整段内容，不必追求冒进，只要做到持续、清晰、准确即可。",
  "在日常工作里，很多岗位都需要长时间处理中文信息，例如录入资料、整理表格、回复消息和编写说明。打字速度并不等于工作能力，但它会直接影响沟通效率。一个能够保持耐心、注意细节并且稳定输出的人，往往也更容易在协作环境中建立可靠感。",
  "优秀的输入习惯通常来自长期积累，例如看清原文后再下手、遇到错字及时回改、避免为了追求速度而频繁停顿。真正高效的打字并不是盲目求快，而是在准确率足够高的前提下维持顺畅节奏。请把这次测试当成一次稳定发挥的练习，而不是单纯的竞速。",
  "如果一个人能够在一分钟内持续完成高质量的中文输入，说明他不仅熟悉常用词组，也具备较好的注意力分配能力。面对面试场景时，保持呼吸平稳、视线聚焦、手部放松，通常比一开始就冲得太快更有效。稳定发挥往往比瞬间爆发更值得信赖。",
  "很多业务场景要求候选人一边阅读材料，一边快速完成中文输入，因此系统会更关注正确汉字数量，而不是机械统计按键次数。你可以把题目理解为一段需要准确传达的信息，只要按照平时工作中的习惯去完成，就能更真实地反映自己的输入速度和准确程度。"
];

const memoryStorage = {
  data: new Map(),
  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  },
  setItem(key, value) {
    this.data.set(key, String(value));
  },
  removeItem(key) {
    this.data.delete(key);
  }
};

const dom = {
  lobbyScreen: document.querySelector("#lobbyScreen"),
  testScreen: document.querySelector("#testScreen"),
  candidateNameInput: document.querySelector("#candidateNameInput"),
  nameError: document.querySelector("#nameError"),
  durationInput: document.querySelector("#durationInput"),
  thresholdInput: document.querySelector("#thresholdInput"),
  configHint: document.querySelector("#configHint"),
  enterTestButton: document.querySelector("#enterTestButton"),
  clearRecordsButton: document.querySelector("#clearRecordsButton"),
  heroDurationValue: document.querySelector("#heroDurationValue"),
  heroThresholdValue: document.querySelector("#heroThresholdValue"),
  heroRuleValue: document.querySelector("#heroRuleValue"),
  passedCandidatesValue: document.querySelector("#passedCandidatesValue"),
  latestSpeedValue: document.querySelector("#latestSpeedValue"),
  recordCountBadge: document.querySelector("#recordCountBadge"),
  recordsEmpty: document.querySelector("#recordsEmpty"),
  recordsTableBody: document.querySelector("#recordsTableBody"),
  currentCandidateName: document.querySelector("#currentCandidateName"),
  sessionThresholdValue: document.querySelector("#sessionThresholdValue"),
  sessionDurationHint: document.querySelector("#sessionDurationHint"),
  backToLobbyTopButton: document.querySelector("#backToLobbyTopButton"),
  returnLobbyButton: document.querySelector("#returnLobbyButton"),
  restartSameCandidateButton: document.querySelector("#restartSameCandidateButton"),
  passageText: document.querySelector("#passageText"),
  typingInput: document.querySelector("#typingInput"),
  timeValue: document.querySelector("#timeValue"),
  correctValue: document.querySelector("#correctValue"),
  speedValue: document.querySelector("#speedValue"),
  accuracyValue: document.querySelector("#accuracyValue"),
  statusBadge: document.querySelector("#statusBadge"),
  resultTitle: document.querySelector("#resultTitle"),
  resultDetail: document.querySelector("#resultDetail"),
  resultMeta: document.querySelector("#resultMeta"),
  recordSaveHint: document.querySelector("#recordSaveHint"),
  startButton: document.querySelector("#startButton"),
  resetButton: document.querySelector("#resetButton"),
  nextButton: document.querySelector("#nextButton")
};

const storage = getStorage();

const state = {
  currentScreen: "lobby",
  currentCandidateName: "",
  settings: loadSettings(),
  passageIndex: 0,
  started: false,
  finished: false,
  composing: false,
  startedAt: 0,
  timeLeft: 0,
  timerId: null,
  recordSaved: false,
  records: loadRecords(),
  lastMetrics: createEmptyMetrics()
};

state.timeLeft = state.settings.durationSeconds;

function getStorage() {
  try {
    if (typeof localStorage !== "undefined") {
      const probeKey = "__typing_test_probe__";
      localStorage.setItem(probeKey, "1");
      localStorage.removeItem(probeKey);
      return localStorage;
    }
  } catch (error) {
    // Fall back to memory storage when localStorage is unavailable.
  }

  return memoryStorage;
}

function createEmptyMetrics() {
  return {
    correctChineseChars: 0,
    typedChineseChars: 0,
    accuracy: 100,
    speed: 0
  };
}

function isChineseChar(char) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(char);
}

function getCurrentPassage() {
  return passages[state.passageIndex];
}

function countChineseChars(text) {
  return Array.from(text).filter(isChineseChar).length;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeName(name) {
  return name.replaceAll(/\s+/g, " ").trim();
}

function normalizeSettings(rawSettings = {}) {
  const durationSeconds = Number.parseInt(rawSettings.durationSeconds, 10);
  const passThreshold = Number.parseInt(rawSettings.passThreshold, 10);

  return {
    durationSeconds: Number.isInteger(durationSeconds) ? durationSeconds : DEFAULT_TEST_DURATION_SECONDS,
    passThreshold: Number.isInteger(passThreshold) ? passThreshold : DEFAULT_PASS_THRESHOLD
  };
}

function validateCandidateName(name) {
  if (!name) {
    return "请输入候选人姓名后再进入测试。";
  }

  return "";
}

function validateSettings(settings) {
  if (!Number.isInteger(settings.durationSeconds) || settings.durationSeconds < 10 || settings.durationSeconds > 600) {
    return "测试时长请输入 10 到 600 之间的整数秒数。";
  }

  if (!Number.isInteger(settings.passThreshold) || settings.passThreshold < 1 || settings.passThreshold > 500) {
    return "达标线请输入 1 到 500 之间的整数。";
  }

  return "";
}

function setNameError(message = "") {
  if (message) {
    dom.nameError.textContent = message;
    dom.nameError.className = "form-hint error";
    return;
  }

  dom.nameError.textContent = "输入姓名后点击“进入测试”，成绩会自动保存到下方记录列表。";
  dom.nameError.className = "form-hint";
}

function setConfigHint(message = "") {
  if (message) {
    dom.configHint.textContent = message;
    dom.configHint.className = "form-hint error";
    return;
  }

  dom.configHint.textContent = "这里的设置会用于本次测试，并同步保存到记录中。";
  dom.configHint.className = "form-hint";
}

function readSettingsFromInputs() {
  return {
    durationSeconds: Number.parseInt(dom.durationInput.value, 10),
    passThreshold: Number.parseInt(dom.thresholdInput.value, 10)
  };
}

function loadSettings() {
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);

    if (!raw) {
      return {
        durationSeconds: DEFAULT_TEST_DURATION_SECONDS,
        passThreshold: DEFAULT_PASS_THRESHOLD
      };
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeSettings(parsed);
    const validationError = validateSettings(normalized);

    if (validationError) {
      return {
        durationSeconds: DEFAULT_TEST_DURATION_SECONDS,
        passThreshold: DEFAULT_PASS_THRESHOLD
      };
    }

    return normalized;
  } catch (error) {
    return {
      durationSeconds: DEFAULT_TEST_DURATION_SECONDS,
      passThreshold: DEFAULT_PASS_THRESHOLD
    };
  }
}

function persistSettings() {
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
}

function syncSettingsUI() {
  dom.durationInput.value = String(state.settings.durationSeconds);
  dom.thresholdInput.value = String(state.settings.passThreshold);
  dom.heroDurationValue.textContent = `${state.settings.durationSeconds} 秒`;
  dom.heroThresholdValue.textContent = `${state.settings.passThreshold} 字/分钟`;
  dom.heroRuleValue.textContent = `当前规则：${state.settings.durationSeconds} 秒 / ${state.settings.passThreshold} 字/分钟`;
  dom.sessionThresholdValue.textContent = `${state.settings.passThreshold} 字/分钟`;
  dom.sessionDurationHint.textContent = `测试时长 ${state.settings.durationSeconds} 秒`;
}

function commitSettingsFromInputs() {
  const nextSettings = readSettingsFromInputs();
  const validationError = validateSettings(nextSettings);

  if (validationError) {
    setConfigHint(validationError);
    return false;
  }

  state.settings = nextSettings;
  state.timeLeft = nextSettings.durationSeconds;
  persistSettings();
  syncSettingsUI();
  setConfigHint();
  return true;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "--";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(timestamp));
  } catch (error) {
    return new Date(timestamp).toLocaleString("zh-CN");
  }
}

function loadRecords() {
  try {
    const raw = storage.getItem(RECORDS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((record) => record && typeof record === "object")
      .map((record) => ({
        candidateName: typeof record.candidateName === "string" ? record.candidateName : "未命名",
        correctChineseChars: Number(record.correctChineseChars) || 0,
        typedChineseChars: Number(record.typedChineseChars) || 0,
        accuracy: Number(record.accuracy) || 0,
        speed: Number(record.speed) || 0,
        passed: Boolean(record.passed),
        durationSeconds: Number(record.durationSeconds) || DEFAULT_TEST_DURATION_SECONDS,
        passThreshold: Number(record.passThreshold) || DEFAULT_PASS_THRESHOLD,
        finishedAt: Number(record.finishedAt) || Date.now()
      }))
      .sort((left, right) => right.finishedAt - left.finishedAt);
  } catch (error) {
    return [];
  }
}

function persistRecords() {
  storage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(state.records));
}

function renderRecords() {
  const totalRecords = state.records.length;
  const passedRecords = state.records.filter((record) => record.passed).length;
  const latestRecord = state.records[0];

  dom.passedCandidatesValue.textContent = String(passedRecords);
  dom.latestSpeedValue.textContent = latestRecord
    ? `${latestRecord.speed} 字/分钟`
    : "暂无";
  dom.recordCountBadge.textContent = `${totalRecords} 条记录`;

  if (totalRecords === 0) {
    dom.recordsEmpty.hidden = false;
    dom.recordsTableBody.innerHTML = "";
    return;
  }

  dom.recordsEmpty.hidden = true;
  dom.recordsTableBody.innerHTML = state.records
    .map((record) => {
      const resultClass = record.passed ? "pass" : "fail";
      const resultText = record.passed ? "达标" : "未达标";

      return `
        <tr>
          <td>${escapeHtml(record.candidateName)}</td>
          <td><span class="record-pill ${resultClass}">${resultText}</span></td>
          <td>${record.correctChineseChars}</td>
          <td>${record.speed} 字/分钟</td>
          <td>${record.accuracy}%</td>
          <td>${record.durationSeconds} 秒 / ${record.passThreshold} 字/分钟</td>
          <td>${escapeHtml(formatDateTime(record.finishedAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function setScreen(screen) {
  state.currentScreen = screen;
  const showLobby = screen === "lobby";

  dom.lobbyScreen.hidden = !showLobby;
  dom.testScreen.hidden = showLobby;
}

function updateCurrentCandidate() {
  dom.currentCandidateName.textContent = state.currentCandidateName || "未设置";
}

function getMetrics(typedText) {
  const targetText = getCurrentPassage();
  let correctChineseChars = 0;

  for (let index = 0; index < typedText.length; index += 1) {
    const typedChar = typedText[index];
    const targetChar = targetText[index];

    if (typedChar === targetChar && isChineseChar(targetChar)) {
      correctChineseChars += 1;
    }
  }

  const typedChineseChars = countChineseChars(typedText);
  const accuracy = typedChineseChars === 0
    ? 100
    : Math.max(0, Math.min(100, Math.round((correctChineseChars / typedChineseChars) * 100)));
  const elapsedSeconds = state.started
    ? Math.max(1, Math.ceil((Date.now() - state.startedAt) / 1000))
    : 0;
  const speed = elapsedSeconds === 0
    ? 0
    : Math.round(correctChineseChars / (elapsedSeconds / 60));

  return {
    correctChineseChars,
    typedChineseChars,
    accuracy,
    speed
  };
}

function updateMetrics(metrics) {
  dom.correctValue.textContent = String(metrics.correctChineseChars);
  dom.speedValue.textContent = `${metrics.speed} 字/分钟`;
  dom.accuracyValue.textContent = `${metrics.accuracy}%`;
}

function renderPassage(typedText) {
  const targetChars = Array.from(getCurrentPassage());
  const typedChars = Array.from(typedText);

  dom.passageText.innerHTML = targetChars
    .map((char, index) => {
      let className = "pending";

      if (typedChars[index] == null) {
        className = index === typedChars.length ? "current" : "pending";
      } else if (typedChars[index] === char) {
        className = "correct";
      } else {
        className = "wrong";
      }

      return `<span class="passage-char ${className}">${escapeHtml(char)}</span>`;
    })
    .join("");
}

function updateStatusBadge(mode, text) {
  dom.statusBadge.className = `status-badge ${mode}`;
  dom.statusBadge.textContent = text;
}

function resetTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimeDisplay(seconds) {
  dom.timeValue.textContent = `${seconds}s`;
}

function setIdleResult() {
  dom.resultTitle.textContent = "等待测试";
  dom.resultDetail.textContent = "测试结束后，这里会显示是否达标，以及与当前自定义规则的差距。";
  dom.resultMeta.textContent = `当前规则：${state.settings.durationSeconds} 秒 / ${state.settings.passThreshold} 字/分钟。提示：测试中禁止粘贴，按 Enter 不会换行。`;
  dom.recordSaveHint.textContent = "测试结束后会自动保存一条候选人成绩记录。";
}

function resetTest(options = {}) {
  const { keepFocus = false } = options;

  resetTimer();
  state.started = false;
  state.finished = false;
  state.startedAt = 0;
  state.timeLeft = state.settings.durationSeconds;
  state.recordSaved = false;
  state.lastMetrics = createEmptyMetrics();

  dom.typingInput.value = "";
  dom.typingInput.disabled = false;
  dom.typingInput.maxLength = getCurrentPassage().length;
  updateTimeDisplay(state.settings.durationSeconds);
  updateMetrics(state.lastMetrics);
  updateStatusBadge("idle", "待开始");
  renderPassage("");
  setIdleResult();
  updateCurrentCandidate();

  if (keepFocus) {
    dom.typingInput.focus();
  }
}

function saveCurrentRecord(finalMetrics, passed) {
  const record = {
    candidateName: state.currentCandidateName || "未命名",
    correctChineseChars: finalMetrics.correctChineseChars,
    typedChineseChars: finalMetrics.typedChineseChars,
    accuracy: finalMetrics.accuracy,
    speed: finalMetrics.speed,
    passed,
    durationSeconds: state.settings.durationSeconds,
    passThreshold: state.settings.passThreshold,
    finishedAt: Date.now()
  };

  state.records.unshift(record);
  state.records = state.records.slice(0, 10);
  persistRecords();
  renderRecords();
}

function startTest() {
  if (state.started || state.finished) {
    return;
  }

  state.started = true;
  state.startedAt = Date.now();
  updateStatusBadge("running", "测试中");

  state.timerId = window.setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - state.startedAt) / 1000);
    const nextTimeLeft = Math.max(0, state.settings.durationSeconds - elapsedSeconds);

    if (nextTimeLeft !== state.timeLeft) {
      state.timeLeft = nextTimeLeft;
      updateTimeDisplay(nextTimeLeft);
    }

    if (nextTimeLeft <= 0) {
      finishTest();
    }
  }, 200);
}

function finishTest() {
  if (state.finished) {
    return;
  }

  resetTimer();
  state.finished = true;
  state.started = false;
  state.timeLeft = 0;
  updateTimeDisplay(0);
  dom.typingInput.disabled = true;

  const finalMetrics = {
    ...state.lastMetrics,
    speed: Math.round(state.lastMetrics.correctChineseChars / (state.settings.durationSeconds / 60))
  };
  const passed = finalMetrics.speed >= state.settings.passThreshold;
  const remaining = Math.max(0, state.settings.passThreshold - finalMetrics.speed);

  updateMetrics(finalMetrics);
  updateStatusBadge(passed ? "pass" : "fail", passed ? "已达标" : "未达标");
  dom.resultTitle.textContent = passed ? "达标" : "未达标";
  dom.resultDetail.textContent = passed
    ? `${state.settings.durationSeconds} 秒内正确输入 ${finalMetrics.correctChineseChars} 个汉字，最终速度 ${finalMetrics.speed} 字/分钟，已达到 ${state.settings.passThreshold} 字/分钟标准。`
    : `${state.settings.durationSeconds} 秒内正确输入 ${finalMetrics.correctChineseChars} 个汉字，最终速度 ${finalMetrics.speed} 字/分钟，还差 ${remaining} 字/分钟达到标准。`;
  dom.resultMeta.textContent = `本次规则：${state.settings.durationSeconds} 秒 / ${state.settings.passThreshold} 字/分钟。最终准确率 ${finalMetrics.accuracy}% 。`;

  if (!state.recordSaved) {
    saveCurrentRecord(finalMetrics, passed);
    state.recordSaved = true;
    dom.recordSaveHint.textContent = `已为 ${state.currentCandidateName || "该候选人"} 保存一条测试记录。`;
  }
}

function handleRunningStatus() {
  if (state.lastMetrics.speed >= state.settings.passThreshold) {
    updateStatusBadge("running", "节奏良好");
  } else {
    updateStatusBadge("running", "继续输入");
  }
}

function handleTypedText(rawValue) {
  const typedText = rawValue.replaceAll(/\r?\n/g, "");

  if (typedText !== rawValue) {
    dom.typingInput.value = typedText;
  }

  if (!typedText && !state.started) {
    renderPassage("");
    updateMetrics(state.lastMetrics);
    return;
  }

  if (!state.started && typedText.length > 0) {
    startTest();
  }

  renderPassage(typedText);
  state.lastMetrics = getMetrics(typedText);
  updateMetrics(state.lastMetrics);

  if (state.finished) {
    return;
  }

  handleRunningStatus();
}

function goToNextPassage() {
  state.passageIndex = (state.passageIndex + 1) % passages.length;
  resetTest({ keepFocus: true });
}

function maybeConfirm(message) {
  if (typeof window.confirm === "function") {
    return window.confirm(message);
  }

  return true;
}

function returnToLobby() {
  if (state.started && !state.finished) {
    const shouldLeave = maybeConfirm("当前测试尚未结束，返回外层界面后本次输入会作废。确定返回吗？");

    if (!shouldLeave) {
      return;
    }
  }

  resetTest();
  setScreen("lobby");
  dom.candidateNameInput.focus();
}

function enterTestScreen() {
  const candidateName = normalizeName(dom.candidateNameInput.value);
  const errorMessage = validateCandidateName(candidateName);

  if (errorMessage) {
    setNameError(errorMessage);
    dom.candidateNameInput.focus();
    return;
  }

  if (!commitSettingsFromInputs()) {
    dom.durationInput.focus();
    return;
  }

  dom.candidateNameInput.value = candidateName;
  state.currentCandidateName = candidateName;
  setNameError();
  setScreen("test");
  resetTest({ keepFocus: true });
}

dom.enterTestButton.addEventListener("click", () => {
  enterTestScreen();
});

dom.candidateNameInput.addEventListener("input", () => {
  if (dom.nameError.className.includes("error")) {
    setNameError();
  }
});

dom.candidateNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    enterTestScreen();
  }
});

dom.durationInput.addEventListener("input", () => {
  if (dom.configHint.className.includes("error")) {
    setConfigHint();
  }
});

dom.thresholdInput.addEventListener("input", () => {
  if (dom.configHint.className.includes("error")) {
    setConfigHint();
  }
});

dom.durationInput.addEventListener("change", () => {
  commitSettingsFromInputs();
  resetTest();
});

dom.thresholdInput.addEventListener("change", () => {
  commitSettingsFromInputs();
  resetTest();
});

dom.clearRecordsButton.addEventListener("click", () => {
  if (!state.records.length) {
    return;
  }

  const shouldClear = maybeConfirm("清空后将删除当前浏览器中的所有测试记录，且无法恢复。确定继续吗？");

  if (!shouldClear) {
    return;
  }

  state.records = [];
  persistRecords();
  renderRecords();
});

dom.backToLobbyTopButton.addEventListener("click", () => {
  returnToLobby();
});

dom.returnLobbyButton.addEventListener("click", () => {
  returnToLobby();
});

dom.restartSameCandidateButton.addEventListener("click", () => {
  resetTest({ keepFocus: true });
});

dom.startButton.addEventListener("click", () => {
  if (state.finished) {
    resetTest({ keepFocus: true });
    return;
  }

  dom.typingInput.focus();
});

dom.resetButton.addEventListener("click", () => {
  resetTest({ keepFocus: true });
});

dom.nextButton.addEventListener("click", () => {
  goToNextPassage();
});

dom.typingInput.addEventListener("compositionstart", () => {
  state.composing = true;
});

dom.typingInput.addEventListener("compositionend", (event) => {
  state.composing = false;
  handleTypedText(event.target.value);
});

dom.typingInput.addEventListener("input", (event) => {
  if (state.composing || state.finished) {
    return;
  }

  handleTypedText(event.target.value);
});

dom.typingInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
  }
});

dom.typingInput.addEventListener("paste", (event) => {
  event.preventDefault();
  dom.resultTitle.textContent = "已拦截粘贴";
  dom.resultDetail.textContent = "为保证面试公平性，输入区域已禁用粘贴，请使用中文输入法手动完成测试。";
  dom.resultMeta.textContent = `当前规则：${state.settings.durationSeconds} 秒 / ${state.settings.passThreshold} 字/分钟。建议重新开始后继续测试。`;
});

dom.typingInput.addEventListener("drop", (event) => {
  event.preventDefault();
});

setScreen("lobby");
setNameError();
setConfigHint();
syncSettingsUI();
renderRecords();
resetTest();
