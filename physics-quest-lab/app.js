const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'physics-quest-lab-v1';

const defaultProgress = {
  activeMission: 'speed', energy: 0, completed: [], stages: {}, predictions: {},
  attempts: 0, correct: 0, wrong: [], reflection: '', mastery: {}
};

let progress;
try { progress = { ...defaultProgress, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
catch { progress = { ...defaultProgress }; }
progress.mastery = progress.mastery || {};
let knowledgeFilter = 'all';
let currentQuestion = null;
let practiceAnswered = false;
let wrongOnly = false;
let masterSession = { id:'m01', phase:'focus', step:0, variant:0, message:'' };

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  renderStatus();
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function groupById(id) { return GROUPS.find(group => group.id === id); }
function chapterById(id) { return KNOWLEDGE.find(item => item.id === id); }
function missionStage(id) { return progress.completed.includes(id) ? 4 : (progress.stages[id] || 0); }
function isUnlocked(index) { return index === 0 || progress.completed.includes(MISSIONS[index - 1].id); }

function renderStatus() {
  $('#energyCount').textContent = progress.energy;
  $('#partCount').textContent = progress.completed.length;
  const rank = progress.completed.length === 6 ? '未来岛总工程师' : progress.completed.length >= 4 ? '系统工程师' : progress.completed.length >= 2 ? '助理工程师' : '见习工程师';
  $('.rank').textContent = rank;
  $('.overall-progress span').style.width = `${Math.max(8, progress.completed.length / 6 * 100)}%`;
}

function renderMissionList() {
  $('#missionList').innerHTML = MISSIONS.map((mission, index) => {
    const unlocked = isUnlocked(index);
    const completed = progress.completed.includes(mission.id);
    const active = progress.activeMission === mission.id;
    const status = completed ? '已完成 ✓' : active ? '进行中' : unlocked ? '可开始' : '待解锁';
    return `<li><button class="mission-item ${active ? 'active' : ''} ${completed ? 'completed' : ''}" data-mission="${mission.id}" ${unlocked ? '' : 'disabled'}>
      <span class="mission-number">${completed ? '✓' : mission.no}</span><span><b>${mission.title}</b><small>${mission.short}</small></span><i>${status}</i>
    </button></li>`;
  }).join('');
}

function renderStepper(stage) {
  const labels = ['1 接任务','2 先预测','3 动手试','4 讲道理','5 题目固化'];
  return labels.map((label, index) => {
    let cls = '';
    if (index === 0 || index < stage + 1) cls = 'done';
    if ((stage === 0 && index === 1) || (stage === 1 && index === 2) || (stage === 2 && index === 3) || (stage === 3 && index === 4)) cls = 'current';
    if (stage === 4) cls = 'done';
    return `<span class="${cls}">${label}</span>`;
  }).join('');
}

function predictionMarkup(mission, stage) {
  const picked = progress.predictions[mission.id];
  return `<span class="eyebrow">第一步 · 先别算，先猜</span><h3>${mission.predict}</h3>
    <div class="choice-row prediction-choices">${mission.predictions.map((text, index) => `<button data-prediction="${index}" class="${Number(picked) === index ? 'selected' : ''}" ${stage >= 2 ? 'disabled' : ''}>${String.fromCharCode(65 + index)}. ${text}</button>`).join('')}</div>
    <p class="prediction-note">预测不是考试。先暴露想法，实验才知道要修正什么。</p>`;
}

function labMarkup(mission) {
  if (mission.type === 'speed') {
    return `<div class="scene-label"><span>实时测速</span><b id="labReadout">2.5 m/s</b></div>
      <div class="track-scene"><div class="distance-flags"><span>0 m</span><span>中点</span><span>终点</span></div><div class="car" id="labCar" aria-hidden="true"><span>📦</span><div class="car-body"></div><i></i><i></i></div><div class="track"></div></div>
      <div class="lab-controls two"><label>路程 <output id="outA">20 m</output><input id="controlA" type="range" min="10" max="40" step="2" value="20"></label><label>时间 <output id="outB">8 s</output><input id="controlB" type="range" min="2" max="12" step="1" value="8"></label></div>`;
  }
  if (mission.type === 'light') {
    return `<div class="scene-label"><span>光路图</span><b id="labReadout">20°</b></div>
      <div class="optic-scene"><svg viewBox="0 0 320 210" role="img" aria-label="入射光和反射光动态光路"><line x1="28" y1="140" x2="292" y2="140" class="mirror-line"/><line x1="160" y1="22" x2="160" y2="190" class="normal-line"/><line id="incidentRay" x1="122" y1="37" x2="160" y2="140" class="laser-line"/><line id="reflectRay" x1="160" y1="140" x2="198" y2="37" class="laser-line reflected"/><circle id="targetSensor" cx="223" cy="50" r="10" class="target-sensor"/><text x="172" y="31">法线</text><text x="233" y="51">接收器 35°</text><text x="22" y="161">平面镜</text></svg></div>
      <div class="lab-controls"><label>入射角 <output id="outA">20°</output><input id="controlA" type="range" min="0" max="70" step="5" value="20"></label></div>`;
  }
  if (mission.type === 'float') {
    return `<div class="scene-label"><span>密度水槽</span><b id="labReadout">浸没 80%</b></div>
      <div class="tank-scene"><div class="waterline"></div><div class="float-box" id="floatBox">补给<br>箱</div><div class="force-arrow up">↑ F浮</div><div class="force-arrow down">↓ G</div></div>
      <div class="lab-controls two"><label>箱子密度 <output id="outA">800 kg/m³</output><input id="controlA" type="range" min="500" max="1300" step="50" value="800"></label><label>液体密度 <output id="outB">1000 kg/m³</output><input id="controlB" type="range" min="700" max="1200" step="50" value="1000"></label></div>`;
  }
  if (mission.type === 'coaster') {
    return `<div class="scene-label"><span>机械能轨道</span><b id="labReadout">可达 16.0 m</b></div>
      <div class="coaster-scene"><svg viewBox="0 0 520 220" role="img" aria-label="过山车高低坡示意"><path d="M15 52 C90 52 90 198 190 198 S300 95 355 95 S430 180 505 180" class="rail-path"/><circle id="coasterCar" cx="26" cy="50" r="14" class="coaster-car"/><line x1="355" y1="95" x2="355" y2="198" class="height-mark"/><text x="366" y="145">目标坡 16 m</text></svg><div class="energy-meters"><span>剩余机械能<i id="energyBar"></i></span><span>摩擦转内能<i id="heatBar"></i></span></div></div>
      <div class="lab-controls two"><label>起点高度 <output id="outA">20 m</output><input id="controlA" type="range" min="16" max="28" step="1" value="20"></label><label>摩擦损耗 <output id="outB">20%</output><input id="controlB" type="range" min="0" max="40" step="5" value="20"></label></div>`;
  }
  if (mission.type === 'circuit') {
    return `<div class="scene-label"><span>安全电路台</span><b id="labReadout">2.25 W</b></div>
      <div class="circuit-scene"><svg viewBox="0 0 520 210" role="img" aria-label="电源、电阻和灯泡串联电路"><path d="M90 50 H390 V165 H90 Z" class="wire"/><line x1="70" y1="82" x2="110" y2="82" class="battery long"/><line x1="80" y1="104" x2="100" y2="104" class="battery"/><path d="M205 50 l12 -12 18 24 18 -24 18 24 18 -12" class="resistor"/><circle cx="390" cy="105" r="35" class="bulb" id="bulb"/><path d="M372 88 l36 34 M408 88 l-36 34" class="filament"/><text x="205" y="88">保护电阻</text><text x="38" y="135">电源</text></svg><div class="meter-row"><span>电流 <b id="currentMeter">0.50 A</b></span><span>安全上限 <b>0.60 A</b></span></div></div>
      <div class="lab-controls two"><label>电压 <output id="outA">4.5 V</output><input id="controlA" type="range" min="3" max="12" step="0.5" value="4.5"></label><label>总电阻 <output id="outB">9 Ω</output><input id="controlB" type="range" min="5" max="30" step="1" value="9"></label></div>`;
  }
  return `<div class="final-console"><div class="console-orbit">Φ</div><h3>五大系统已连接</h3><p>先完成预测和解释，再进入跨章节验收。</p><div class="system-dots">${MISSIONS.slice(0,5).map(item => `<span class="${progress.completed.includes(item.id) ? 'on' : ''}">${item.no}</span>`).join('')}</div></div>`;
}

function renderMission(id = progress.activeMission) {
  const mission = MISSIONS.find(item => item.id === id) || MISSIONS[0];
  const index = MISSIONS.indexOf(mission);
  if (!isUnlocked(index)) return;
  progress.activeMission = mission.id;
  const stage = missionStage(mission.id);
  const completed = stage === 4;
  $('#missionWorkbench').innerHTML = `
    <header class="workbench-head"><div><span class="eyebrow cyan">任务 ${mission.no} · ${mission.region}</span><h2>${mission.heading}</h2><p class="mission-story">${mission.story}</p></div><div class="timer-chip">${mission.target}</div></header>
    <div class="stepper" aria-label="任务流程">${renderStepper(stage)}</div>
    ${completed ? `<section class="success-banner"><span>系统已上线</span><h3>${mission.title}验收通过！</h3><p>你获得了 1 个工程部件。真正的完成不是调出答案，而是能说清它为什么成立。</p>${index < MISSIONS.length - 1 ? `<button class="primary-btn next-mission" data-next="${MISSIONS[index + 1].id}">前往下一项任务 →</button>` : '<button class="primary-btn show-profile">查看总工程师档案</button>'}</section>` : `
      <section class="challenge-grid">
        <div class="sim-panel">${labMarkup(mission)}<button class="primary-btn run-lab" ${stage < 1 ? 'disabled' : ''}>▶ ${mission.type === 'final' ? '检查系统状态' : '运行实验'}</button><div class="lab-feedback" id="labFeedback">${stage < 1 ? '先记录预测，实验台才会通电。' : '调节参数，再运行实验验证想法。'}</div></div>
        <div class="control-panel">${predictionMarkup(mission, stage)}<div class="divider"></div><div class="formula-card"><span>关键规律</span><strong>${mission.formula}</strong><small>${mission.formulaNote}</small></div></div>
      </section>
      ${stage >= 2 ? reasoningMarkup(mission, stage) : coachMarkup(mission)}
      ${stage >= 3 ? (mission.type === 'final' ? finalChallengeMarkup() : missionQuestionMarkup(mission)) : ''}
    `}`;
  renderMissionList();
  renderStatus();
  if (!completed) updateLab(mission);
  saveProgress();
}

function coachMarkup(mission) {
  return `<section class="coach-card"><div class="coach-avatar">老<br>牛</div><div><span class="eyebrow">工程导师的追问</span><h3>你准备怎样制造证据？</h3><p>一次只改变一个条件，并把读数和目标比较。失败的参数也有价值，它能帮你划出规律的边界。</p></div><button class="ghost-btn mission-hint" data-hint="${mission.id}">给我一点提示</button></section>`;
}

function reasoningMarkup(mission, stage) {
  return `<section class="reasoning-card"><div><span class="eyebrow cyan">主张—证据—规律</span><h3>${mission.reasonPrompt}</h3><p>别只写“因为公式”。说清你调了什么、看见什么、依据什么规律。</p></div><textarea id="reasonText" rows="4" ${stage >= 3 ? 'disabled' : ''} placeholder="我的解释是……">${escapeHtml(progress.stages[`${mission.id}Reason`] || '')}</textarea>${stage < 3 ? '<button class="primary-btn submit-reason">提交解释</button>' : `<div class="model-reason"><b>参考表达</b>${mission.modelReason}</div>`}<div id="reasonFeedback" class="reason-feedback"></div></section>`;
}

function missionQuestionMarkup(mission) {
  return `<section class="mission-quiz"><span class="eyebrow">最后一步 · 换个情境</span><h3>${mission.question.q}</h3><div class="quiz-options">${mission.question.options.map((option,index) => `<button data-mission-answer="${index}"><span>${String.fromCharCode(65+index)}</span>${option}</button>`).join('')}</div><div id="missionQuizFeedback" class="quiz-feedback"></div></section>`;
}

function finalChallengeMarkup() {
  const ids = ['q04','q09','q12','q20','q23'];
  const questions = ids.map(id => QUESTIONS.find(q => q.id === id));
  return `<section class="mission-quiz final-quiz"><span class="eyebrow">终极验收 · 至少答对 4 题</span><div class="final-question-list">${questions.map((q,qi) => `<fieldset><legend>${qi+1}. ${q.q}</legend>${q.options.map((option,oi) => `<label><input type="radio" name="final-${q.id}" value="${oi}"><span>${option}</span></label>`).join('')}</fieldset>`).join('')}</div><button class="primary-btn submit-final">提交整体验收</button><div id="finalFeedback" class="quiz-feedback"></div></section>`;
}

function updateLab(mission) {
  const a = Number($('#controlA')?.value || 0);
  const b = Number($('#controlB')?.value || 0);
  if (mission.type === 'speed') {
    const speed = a / b;
    $('#outA').textContent = `${a} m`; $('#outB').textContent = `${b} s`; $('#labReadout').textContent = `${speed.toFixed(1)} m/s`;
  } else if (mission.type === 'light') {
    $('#outA').textContent = `${a}°`; $('#labReadout').textContent = `${a}°`;
    const rad = a * Math.PI / 180, len = 110;
    const dx = Math.sin(rad) * len, dy = Math.cos(rad) * len;
    $('#incidentRay').setAttribute('x1', (160-dx).toFixed(1)); $('#incidentRay').setAttribute('y1', (140-dy).toFixed(1));
    $('#reflectRay').setAttribute('x2', (160+dx).toFixed(1)); $('#reflectRay').setAttribute('y2', (140-dy).toFixed(1));
  } else if (mission.type === 'float') {
    const ratio = a / b;
    $('#outA').textContent = `${a} kg/m³`; $('#outB').textContent = `${b} kg/m³`;
    $('#labReadout').textContent = ratio >= 1 ? '正在下沉' : `浸没 ${(ratio*100).toFixed(0)}%`;
    const box = $('#floatBox');
    box.classList.toggle('sunk', ratio >= 1); box.style.transform = `translateY(${ratio >= 1 ? 72 : Math.max(-18, (ratio-.75)*90)}px)`;
  } else if (mission.type === 'coaster') {
    const available = a * (1-b/100);
    $('#outA').textContent = `${a} m`; $('#outB').textContent = `${b}%`; $('#labReadout').textContent = `可达 ${available.toFixed(1)} m`;
    $('#energyBar').style.width = `${Math.min(100, available/28*100)}%`; $('#heatBar').style.width = `${b/40*100}%`;
  } else if (mission.type === 'circuit') {
    const current = a / b, power = a * current;
    $('#outA').textContent = `${a.toFixed(1)} V`; $('#outB').textContent = `${b} Ω`; $('#labReadout').textContent = `${power.toFixed(2)} W`; $('#currentMeter').textContent = `${current.toFixed(2)} A`;
    $('#bulb').style.filter = `drop-shadow(0 0 ${Math.min(22,power*5)}px rgba(255,209,102,.9))`; $('#bulb').style.fill = power >= 2.5 && power <= 3.5 ? '#ffd166' : '#324b56';
  }
}

function runLab(mission) {
  const stage = missionStage(mission.id);
  if (stage < 1) return toast('先做预测，再启动实验。');
  const a = Number($('#controlA')?.value || 0), b = Number($('#controlB')?.value || 0);
  let success = false, message = '';
  if (mission.type === 'speed') {
    const value = a/b; success = Math.abs(value-4) < .06; message = success ? `${a}÷${b}=4.0 m/s，速度闸已放行。` : value < 4 ? '速度偏低：尝试增大路程或缩短时间。' : '速度偏高：尝试减小路程或增加时间。';
    const car = $('#labCar'); car.classList.remove('running'); void car.offsetWidth; car.style.transitionDuration = `${Math.max(.7,Math.min(2.4,b/4))}s`; car.classList.add('running');
  } else if (mission.type === 'light') {
    success = a === 35; message = success ? '入射角与反射角都是 35°，光束命中接收器。' : a < 35 ? '光束落在接收器左侧，再增大入射角。' : '光束越过接收器，试着减小入射角。';
  } else if (mission.type === 'float') {
    const ratio = a/b; success = ratio >= .7 && ratio <= .85; message = success ? `箱子密度小于液体，稳定漂浮并浸没 ${(ratio*100).toFixed(0)}%。` : ratio >= 1 ? '箱子密度不小于液体，沉底了。换液体或减小箱子密度。' : ratio < .7 ? '露出太多，过不了桥洞；需要提高浸没比例。' : '浸得太深，可能进水；需要降低浸没比例。';
  } else if (mission.type === 'coaster') {
    const available = a*(1-b/100); success = available >= 16 && available <= 18; message = success ? `扣除摩擦损耗后可达 ${available.toFixed(1)} m，安全越坡。` : available < 16 ? '剩余机械能不足：提高起点或减小摩擦损耗。' : '能量过多，会使列车过速：降低起点或增加合理阻力。';
    $('#coasterCar').classList.remove('go'); void $('#coasterCar').getBBox(); $('#coasterCar').classList.add('go');
  } else if (mission.type === 'circuit') {
    const current=a/b,power=a*current; success=power>=2.5&&power<=3.5&&current<=.6; message = success ? `I=${current.toFixed(2)} A，P=${power.toFixed(2)} W，亮度与安全都达标。` : current>.6 ? `电流 ${current.toFixed(2)} A 超过上限，增大电阻或降低电压。` : power<2.5 ? '功率不足，灯太暗；在不超流的前提下调整参数。' : '功率过大，灯有损坏风险。';
  } else {
    success = MISSIONS.slice(0,5).every(item => progress.completed.includes(item.id)); message = success ? '五个系统全部在线。现在用一段解释开启终极验收。' : '还有系统未上线，请先完成前面的任务。';
  }
  $('#labFeedback').textContent = message;
  $('#labFeedback').className = `lab-feedback ${success ? 'good' : 'try'}`;
  if (progress.predictions[mission.id] !== undefined) {
    const right = Number(progress.predictions[mission.id]) === mission.predictAnswer;
    $('#labFeedback').textContent += right ? ' 你的预测得到了证据支持。' : ' 这次证据与预测不同——修正想法就是科学进步。';
  }
  if (success && stage < 2) {
    progress.stages[mission.id] = 2; progress.energy += 30; saveProgress();
    setTimeout(() => renderMission(mission.id), mission.type === 'speed' ? 900 : 450);
  }
}

function submitReason(mission) {
  const text = $('#reasonText').value.trim();
  const hits = mission.keywords.filter(word => text.includes(word));
  const enough = mission.type === 'final' ? text.length >= 8 : text.length >= 18 && hits.length >= Math.min(2, mission.keywords.length);
  if (!enough) {
    const missing = mission.keywords.filter(word => !hits.includes(word)).slice(0,2);
    $('#reasonFeedback').textContent = mission.type === 'final' ? '再具体一点：这个问题准备观察或测量什么？' : `再补一条证据，并试着用上：${missing.join('、') || '关键规律'}。`;
    return;
  }
  progress.stages[`${mission.id}Reason`] = text;
  progress.stages[mission.id] = 3;
  progress.energy += 20;
  saveProgress();
  toast('解释通过！现在换个情境检验迁移。');
  renderMission(mission.id);
}

function answerMissionQuestion(mission, answer, button) {
  $$('.quiz-options button', button.closest('.mission-quiz')).forEach(item => item.disabled = true);
  const feedback = $('#missionQuizFeedback');
  if (answer === mission.question.answer) {
    button.classList.add('correct'); feedback.innerHTML = `<b>判断正确。</b>${mission.question.explain}`; completeMission(mission.id);
  } else {
    button.classList.add('wrong'); $$('.quiz-options button', button.closest('.mission-quiz'))[mission.question.answer].classList.add('correct'); feedback.innerHTML = `<b>先修正再前进。</b>${mission.question.explain}<button class="ghost-btn retry-mission-quiz">我理解了，再选一次</button>`;
  }
}

function completeMission(id) {
  if (!progress.completed.includes(id)) {
    progress.completed.push(id); progress.stages[id] = 4; progress.energy += id === 'final' ? 220 : 100; saveProgress();
    toast(id === 'final' ? '未来岛全部重启！' : '获得 1 个工程部件！');
    setTimeout(() => renderMission(id), 850);
  }
}

function submitFinal() {
  const ids = ['q04','q09','q12','q20','q23'];
  let score = 0, unanswered = 0;
  ids.forEach(id => {
    const q = QUESTIONS.find(item => item.id === id);
    const chosen = $(`input[name="final-${id}"]:checked`);
    if (!chosen) unanswered += 1; else if (Number(chosen.value) === q.answer) score += 1;
  });
  if (unanswered) return toast(`还有 ${unanswered} 题没有作答。`);
  const feedback = $('#finalFeedback');
  if (score >= 4) { feedback.innerHTML = `<b>验收通过：${score}/5。</b>你已经能把规律迁移到新情境。`; completeMission('final'); }
  else { feedback.innerHTML = `<b>本轮 ${score}/5。</b>先回到知识地图检查错因，再重新验收。`; }
}

function renderKnowledgeFilters() {
  $('#knowledgeFilters').innerHTML = `<button class="active" data-group="all">全部 22 章</button>${GROUPS.map(group => `<button data-group="${group.id}">${group.icon} ${group.name}</button>`).join('')}`;
}

function renderKnowledge() {
  const query = ($('#knowledgeSearch')?.value || '').trim().toLowerCase();
  const items = KNOWLEDGE.filter(item => (knowledgeFilter === 'all' || item.group === knowledgeFilter) && [item.title,item.core,item.formula,item.trap].join(' ').toLowerCase().includes(query));
  $('#knowledgeGrid').innerHTML = items.length ? items.map(item => {
    const group = groupById(item.group);
    return `<article class="knowledge-card" style="--accent:${group.color}"><div class="card-top"><span>${item.volume} · 第 ${item.no} 章</span><i>${group.icon}</i></div><h3>${item.title}</h3><p>${item.core}</p><div class="knowledge-formula">${item.formula}</div><button data-knowledge="${item.id}">打开学习卡 →</button></article>`;
  }).join('') : '<div class="empty-state"><b>没找到这个知识点</b><span>换一个关键词，或选择“全部 22 章”。</span></div>';
}

function openKnowledge(id) {
  const item = chapterById(id), group = groupById(item.group);
  $('#knowledgeDetail').innerHTML = `<div class="detail-head" style="--accent:${group.color}"><span class="detail-icon">${group.icon}</span><div><span class="eyebrow">${item.volume} · ${group.name}</span><h2>${item.title}</h2></div></div><div class="detail-grid"><section><span>一句话抓核心</span><p>${item.core}</p></section><section><span>公式与单位</span><strong>${item.formula}</strong><p>${item.unit}</p></section><section><span>桌边小实验</span><p>${item.experiment}</p></section><section class="warning"><span>最容易踩的坑</span><p>${item.trap}</p></section></div><div class="think-card"><span>先别看答案</span><b>${item.question}</b><button class="ghost-btn jump-practice" data-chapter="${item.id}">去做对应题目 →</button></div>`;
  $('#knowledgeDialog').showModal();
}

function masteryRecord(id) {
  if (!progress.mastery[id]) progress.mastery[id] = { level:0, reviews:0, wrong:0, dueAt:0 };
  return progress.mastery[id];
}

function masteryStatus(problem) {
  const record = masteryRecord(problem.id);
  if (record.level >= 3 && record.dueAt > Date.now()) return '已稳固';
  if (record.reviews > 0 && record.dueAt <= Date.now()) return '到期回练';
  if (record.level === 0) return '未学习';
  return `加固 ${record.level}/3`;
}

function renderMastery() {
  const now = Date.now();
  const mastered = MASTER_PROBLEMS.filter(item => masteryRecord(item.id).level >= 3).length;
  const due = MASTER_PROBLEMS.filter(item => {
    const record = masteryRecord(item.id);
    return record.level === 0 || record.dueAt <= now;
  }).length;
  $('#masteredCount').textContent = mastered;
  $('#dueCount').textContent = due;
  $('#confusionList').innerHTML = MASTER_PROBLEMS.map((problem,index) => {
    const record = masteryRecord(problem.id);
    const active = problem.id === masterSession.id;
    return `<button class="confusion-item ${active ? 'active' : ''}" data-master="${problem.id}"><span>${String(index+1).padStart(2,'0')}</span><div><b>${problem.title}</b><small>${problem.tag}</small></div><i class="level-${record.level}">${masteryStatus(problem)}</i></button>`;
  }).join('');
  renderMasterProblem();
}

function renderMasterProblem() {
  const problem = MASTER_PROBLEMS.find(item => item.id === masterSession.id) || MASTER_PROBLEMS[0];
  const group = groupById(problem.group);
  const record = masteryRecord(problem.id);
  const phaseMap = {focus:0,breakdown:1,variant:2,complete:3};
  const phase = phaseMap[masterSession.phase];
  $('#masterProblemCard').innerHTML = `
    <header class="master-card-head" style="--accent:${group.color}"><div><span class="eyebrow">${group.icon} ${group.name} · ${problem.tag}</span><h3>${problem.title}</h3></div><div class="master-level"><b>${record.level}/3</b><span>记忆等级</span></div></header>
    <div class="master-steps"><span class="${phase>=0?'on':''}">1 辨概念</span><span class="${phase>=1?'on':''}">2 拆母题</span><span class="${phase>=2?'on':''}">3 连做变式</span><span class="${phase>=3?'on':''}">4 安排回练</span></div>
    <section class="formula-compare">${problem.pair.map((item,index) => `<div><span>${index===0?'A':'B'}</span><h4>${item.name}</h4><strong>${item.formula}</strong><p>${item.when}</p></div>`).join('')}</section>
    <div class="memory-cue"><b>一眼区分</b><span>${problem.cue}</span></div>
    <section class="mother-stem"><span>母题</span><h4>${problem.stem}</h4></section>
    ${masterPhaseMarkup(problem)}
    ${masterSession.message ? `<div class="master-feedback">${masterSession.message}</div>` : ''}`;
}

function masterPhaseMarkup(problem) {
  if (masterSession.phase === 'focus') {
    return `<section class="master-focus"><span>先判断，不急着算</span><h4>${problem.focus.q}</h4><div class="master-options">${problem.focus.options.map((option,index)=>`<button data-master-focus="${index}"><i>${String.fromCharCode(65+index)}</i>${option}</button>`).join('')}</div></section>`;
  }
  if (masterSession.phase === 'breakdown') {
    return `<section class="breakdown"><div class="focus-proof"><b>选规律</b>${problem.focus.explain}</div><div class="solution-chain">${problem.steps.map((step,index)=>`<div class="${index < masterSession.step ? 'revealed' : ''}"><span>${index+1}</span><p>${index < masterSession.step ? step : '先想一想：这一步应该做什么？'}</p></div>`).join('')}</div><button class="primary-btn reveal-master-step">${masterSession.step < problem.steps.length ? '揭开下一步 →' : '开始两道变式 →'}</button></section>`;
  }
  if (masterSession.phase === 'variant') {
    const variant = problem.variants[masterSession.variant];
    return `<section class="master-variant"><div class="variant-label"><span>连续加固 ${masterSession.variant+1}/2</span><small>换了数字或问法，规律不能换</small></div><h4>${variant.q}</h4><div class="master-options">${variant.options.map((option,index)=>`<button data-master-variant="${index}"><i>${String.fromCharCode(65+index)}</i>${option}</button>`).join('')}</div></section>`;
  }
  const record = masteryRecord(problem.id);
  const dueText = record.level >= 3 ? '3 天后再检验一次' : record.level === 2 ? '明天自动进入回练' : '10 分钟后自动进入回练';
  return `<section class="master-complete"><div>✓</div><span>本轮连续两次判断正确</span><h4>${problem.title} 已进入记忆队列</h4><p>${dueText}。如果下次答错，它会提前回来。</p><button class="primary-btn next-master">练下一道母题 →</button><button class="ghost-btn restart-master">马上再来一轮</button></section>`;
}

function chooseMasterProblem(id) {
  masterSession = { id, phase:'focus', step:0, variant:0, message:'' };
  renderMastery();
}

function answerMasterFocus(answer) {
  const problem = MASTER_PROBLEMS.find(item => item.id === masterSession.id);
  const record = masteryRecord(problem.id);
  if (answer === problem.focus.answer) {
    masterSession.phase = 'breakdown'; masterSession.step = 1; masterSession.message = `<b>识别正确。</b>${problem.focus.explain}`;
    progress.energy += 5;
  } else {
    record.wrong += 1; record.dueAt = Date.now();
    masterSession.message = `<b>先不计算。</b>${problem.focus.explain}`;
  }
  saveProgress(); renderMastery();
}

function revealMasterStep() {
  const problem = MASTER_PROBLEMS.find(item => item.id === masterSession.id);
  if (masterSession.step < problem.steps.length) {
    masterSession.step += 1;
    masterSession.message = '每一步都要能回答：“这个量从哪里来？”';
  } else {
    masterSession.phase = 'variant'; masterSession.variant = 0; masterSession.message = '现在遮住母题答案，只带走判断方法。';
  }
  renderMastery();
}

function answerMasterVariant(answer) {
  const problem = MASTER_PROBLEMS.find(item => item.id === masterSession.id);
  const variant = problem.variants[masterSession.variant];
  const record = masteryRecord(problem.id);
  if (answer !== variant.answer) {
    record.wrong += 1; record.dueAt = Date.now(); masterSession.variant = 0;
    masterSession.message = `<b>连续记录清零，母题会更快回来。</b>${variant.explain}`;
    saveProgress(); renderMastery(); return;
  }
  if (masterSession.variant === 0) {
    masterSession.variant = 1; masterSession.message = `<b>第一次加固正确。</b>${variant.explain}`;
    progress.energy += 5; saveProgress(); renderMastery(); return;
  }
  record.reviews += 1;
  record.level = Math.min(3, record.level + 1);
  const intervals = [0, 10*60*1000, 24*60*60*1000, 3*24*60*60*1000];
  record.dueAt = Date.now() + intervals[record.level];
  progress.energy += 20;
  masterSession.phase = 'complete'; masterSession.message = `<b>第二次加固正确。</b>${variant.explain}`;
  saveProgress(); renderMastery();
}

function chooseNextMaster() {
  const currentIndex = MASTER_PROBLEMS.findIndex(item => item.id === masterSession.id);
  const ordered = [...MASTER_PROBLEMS.slice(currentIndex+1),...MASTER_PROBLEMS.slice(0,currentIndex+1)];
  const next = ordered.find(item => {
    const record = masteryRecord(item.id);
    return record.level === 0 || record.dueAt <= Date.now();
  }) || ordered.sort((a,b)=>masteryRecord(a.id).level-masteryRecord(b.id).level)[0];
  chooseMasterProblem(next.id);
}

function setupPracticeControls() {
  $('#practiceGroup').innerHTML = `<option value="all">全部知识链</option>${GROUPS.map(group => `<option value="${group.id}">${group.name}</option>`).join('')}`;
}

function practicePool() {
  const group = $('#practiceGroup').value, level = $('#practiceLevel').value;
  return QUESTIONS.filter(q => {
    const chapter = chapterById(q.chapter);
    return (group === 'all' || chapter.group === group) && (level === 'all' || q.level === level) && (!wrongOnly || progress.wrong.includes(q.id));
  });
}

function choosePracticeQuestion(forceDifferent = false) {
  const pool = practicePool();
  if (!pool.length) {
    currentQuestion = null;
    $('#quizCard').innerHTML = `<div class="empty-state"><b>${wrongOnly ? '返工清单已清空！' : '没有符合条件的题目'}</b><span>${wrongOnly ? '把错误变成了经验，做得好。' : '请调整知识链或难度。'}</span></div>`;
    return;
  }
  const candidates = forceDifferent && pool.length > 1 ? pool.filter(q => q.id !== currentQuestion?.id) : pool;
  currentQuestion = candidates[Math.floor(Math.random()*candidates.length)];
  practiceAnswered = false;
  renderPracticeQuestion();
}

function renderPracticeQuestion() {
  if (!currentQuestion) return;
  const chapter = chapterById(currentQuestion.chapter), group = groupById(chapter.group);
  $('#quizCard').innerHTML = `<div class="quiz-meta"><span style="--dot:${group.color}">${group.icon} ${chapter.title}</span><i>${currentQuestion.level}</i></div><h3>${currentQuestion.q}</h3><div class="quiz-options practice-options">${currentQuestion.options.map((option,index) => `<button data-practice-answer="${index}"><span>${String.fromCharCode(65+index)}</span>${option}</button>`).join('')}</div><div class="quiz-actions"><button class="ghost-btn practice-hint">只看提示</button><button class="ghost-btn next-question" hidden>下一题 →</button></div><div id="practiceFeedback" class="quiz-feedback"></div>`;
}

function answerPractice(answer, button) {
  if (practiceAnswered) return;
  practiceAnswered = true; progress.attempts += 1;
  const right = answer === currentQuestion.answer;
  if (right) {
    progress.correct += 1; progress.energy += 10; progress.wrong = progress.wrong.filter(id => id !== currentQuestion.id); button.classList.add('correct');
  } else {
    if (!progress.wrong.includes(currentQuestion.id)) progress.wrong.push(currentQuestion.id); button.classList.add('wrong'); $$('.practice-options button')[currentQuestion.answer].classList.add('correct');
  }
  $$('.practice-options button').forEach(item => item.disabled = true);
  $('#practiceFeedback').innerHTML = `<b>${right ? '证据链成立。' : '这道题进入返工清单。'}</b><p>${currentQuestion.explain}</p><div class="error-lens"><span>把错误归因：</span><button>读题</button><button>概念</button><button>过程</button><button>计算</button></div>`;
  $('.next-question').hidden = false;
  saveProgress(); renderPracticeSummary();
}

function renderPracticeSummary() {
  $('#practiceAccuracy').textContent = progress.attempts ? `${Math.round(progress.correct/progress.attempts*100)}%` : '—';
  $('#wrongCount').textContent = progress.wrong.length;
  $('#wrongPractice').classList.toggle('active', wrongOnly);
}

function renderProfile() {
  const accuracy = progress.attempts ? Math.round(progress.correct/progress.attempts*100) : 0;
  const memoryMastered = MASTER_PROBLEMS.filter(item => masteryRecord(item.id).level >= 3).length;
  $('#profileStats').innerHTML = `<span class="eyebrow cyan">当前身份</span><h3>${progress.completed.length === 6 ? '未来岛总工程师' : progress.completed.length >= 4 ? '系统工程师' : progress.completed.length >= 2 ? '助理工程师' : '见习工程师'}</h3><div class="stat-grid"><div><b>${progress.completed.length}/6</b><span>系统上线</span></div><div><b>${progress.energy}</b><span>能量点</span></div><div><b>${accuracy || '—'}${accuracy ? '%' : ''}</b><span>训练正确率</span></div><div><b>${progress.wrong.length}</b><span>返工题</span></div></div><div class="memory-stat"><span>易混母题稳固</span><b>${memoryMastered}/${MASTER_PROBLEMS.length}</b></div><div class="profile-progress"><i style="width:${progress.completed.length/6*100}%"></i></div>`;
  const badges = [
    ['🔭','敢猜敢验',Object.keys(progress.predictions).length >= 3],
    ['🧰','三次开工',progress.completed.length >= 3],
    ['🧠','证据说话',Object.keys(progress.stages).some(key => key.endsWith('Reason'))],
    ['🧩','母题加固',Object.values(progress.mastery).some(item => item.level > 0)],
    ['🩹','修复错误',progress.attempts >= 3 && progress.wrong.length < progress.attempts],
    ['🏝️','点亮全岛',progress.completed.length === 6]
  ];
  $('#badgeGrid').innerHTML = badges.map(([icon,name,earned]) => `<div class="badge ${earned ? 'earned' : ''}"><span>${icon}</span><b>${name}</b><small>${earned ? '已获得' : '继续探索'}</small></div>`).join('');
  $('#reflectionNote').value = progress.reflection || '';
}

function switchView(viewName) {
  $$('.tab').forEach(tab => { const active = tab.dataset.view === viewName; tab.classList.toggle('active',active); tab.setAttribute('aria-selected', String(active)); });
  $$('.view').forEach(view => { const show = view.id === `${viewName}View`; view.hidden = !show; view.classList.toggle('active-view',show); });
  if (viewName === 'profile') renderProfile();
  if (viewName === 'practice') renderPracticeSummary();
  if (viewName === 'mastery') renderMastery();
  window.scrollTo({top:0,behavior:'smooth'});
}

document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.matches('.tab')) switchView(target.dataset.view);
  if (target.dataset.mission) renderMission(target.dataset.mission);
  if (target.dataset.prediction !== undefined) {
    const mission = MISSIONS.find(item => item.id === progress.activeMission);
    progress.predictions[mission.id] = Number(target.dataset.prediction); progress.stages[mission.id] = Math.max(1,missionStage(mission.id)); saveProgress(); renderMission(mission.id); toast('预测已封存。现在让实验来裁判。');
  }
  if (target.matches('.run-lab')) runLab(MISSIONS.find(item => item.id === progress.activeMission));
  if (target.matches('.submit-reason')) submitReason(MISSIONS.find(item => item.id === progress.activeMission));
  if (target.dataset.missionAnswer !== undefined) answerMissionQuestion(MISSIONS.find(item => item.id === progress.activeMission), Number(target.dataset.missionAnswer), target);
  if (target.matches('.retry-mission-quiz')) renderMission(progress.activeMission);
  if (target.matches('.submit-final')) submitFinal();
  if (target.dataset.next) renderMission(target.dataset.next);
  if (target.matches('.show-profile')) switchView('profile');
  if (target.matches('.mission-hint')) {
    const hints = {speed:'试试 20 m 和 5 s。',light:'角度要从法线量起，目标是 35°。',float:'浸没比例约等于物体密度÷液体密度。',coaster:'可达高度≈起点高度×(1−损耗比例)。',circuit:'先算 I=U/R，再算 P=UI。',final:'好问题通常可以通过观察、测量或实验来回答。'};
    toast(hints[target.dataset.hint]);
  }
  if (target.dataset.group) { knowledgeFilter = target.dataset.group; $$('#knowledgeFilters button').forEach(btn => btn.classList.toggle('active',btn===target)); renderKnowledge(); }
  if (target.dataset.knowledge) openKnowledge(target.dataset.knowledge);
  if (target.dataset.master) chooseMasterProblem(target.dataset.master);
  if (target.dataset.masterFocus !== undefined) answerMasterFocus(Number(target.dataset.masterFocus));
  if (target.matches('.reveal-master-step')) revealMasterStep();
  if (target.dataset.masterVariant !== undefined) answerMasterVariant(Number(target.dataset.masterVariant));
  if (target.matches('.next-master')) chooseNextMaster();
  if (target.matches('.restart-master')) chooseMasterProblem(masterSession.id);
  if (target.matches('.dialog-close')) target.closest('dialog').close();
  if (target.matches('.jump-practice')) { $('#knowledgeDialog').close(); const chapter=chapterById(target.dataset.chapter); $('#practiceGroup').value=chapter.group; wrongOnly=false; choosePracticeQuestion(); switchView('practice'); }
  if (target.matches('#newPractice') || target.matches('.next-question')) { wrongOnly=false; choosePracticeQuestion(true); renderPracticeSummary(); }
  if (target.matches('#wrongPractice')) { wrongOnly=!wrongOnly; choosePracticeQuestion(); renderPracticeSummary(); }
  if (target.dataset.practiceAnswer !== undefined) answerPractice(Number(target.dataset.practiceAnswer),target);
  if (target.matches('.practice-hint')) { $('#practiceFeedback').innerHTML=`<b>提示：</b>${currentQuestion.hint}`; }
  if (target.matches('.error-lens button')) { $$('.error-lens button').forEach(btn=>btn.classList.remove('selected')); target.classList.add('selected'); toast('错因已标记。下次先检查这一环。'); }
  if (target.matches('#saveReflection')) { progress.reflection=$('#reflectionNote').value.trim(); saveProgress(); toast('复盘已保存。会解释，比会背更厉害。'); }
  if (target.matches('#resetProgress')) { if (confirm('确定清空本机上的任务、答题、母题加固和复盘记录吗？')) { progress={...defaultProgress,completed:[],stages:{},predictions:{},wrong:[],mastery:{}}; saveProgress(); masterSession={id:'m01',phase:'focus',step:0,variant:0,message:''}; renderMission('speed'); renderMastery(); renderProfile(); toast('新的工程周期已开始。'); } }
  if (target.matches('#teacherMode')) $('#teacherDialog').showModal();
});

document.addEventListener('input', event => {
  if (event.target.matches('#controlA,#controlB')) updateLab(MISSIONS.find(item => item.id === progress.activeMission));
  if (event.target.matches('#knowledgeSearch')) renderKnowledge();
});

$('#practiceGroup').addEventListener('change',()=>{wrongOnly=false;choosePracticeQuestion();renderPracticeSummary();});
$('#practiceLevel').addEventListener('change',()=>{wrongOnly=false;choosePracticeQuestion();renderPracticeSummary();});
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));

renderKnowledgeFilters();
renderKnowledge();
renderMastery();
setupPracticeControls();
renderMission(progress.activeMission);
choosePracticeQuestion();
renderPracticeSummary();
renderProfile();
setInterval(() => { if (!$('#masteryView').hidden) renderMastery(); }, 60000);

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = tool => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});

  register({
    name: 'read_learning_progress', title: '读取学习进度',
    description: '读取未来岛任务完成数、能量点、训练正确率和返工题数量，不修改任何记录。',
    inputSchema: { type:'object', properties:{}, additionalProperties:false },
    annotations: { readOnlyHint:true, untrustedContentHint:false },
    execute() {
      return { completedMissions:progress.completed.length, totalMissions:6, energy:progress.energy, practiceAccuracy:progress.attempts ? Math.round(progress.correct/progress.attempts*100) : null, wrongQuestions:progress.wrong.length, masteredProblems:MASTER_PROBLEMS.filter(item=>masteryRecord(item.id).level>=3).length, totalMasterProblems:MASTER_PROBLEMS.length };
    }
  });

  register({
    name: 'start_physics_mission', title: '开始物理工程任务',
    description: '打开一个已经解锁的未来岛工程任务，并把页面切换到任务工作台。',
    inputSchema: { type:'object', properties:{ missionId:{ type:'string', enum:MISSIONS.map(item=>item.id) } }, required:['missionId'], additionalProperties:false },
    annotations: { readOnlyHint:false, untrustedContentHint:false },
    execute(input) {
      const index = MISSIONS.findIndex(item=>item.id===input?.missionId);
      if (index < 0) throw new Error('未知任务');
      if (!isUnlocked(index)) throw new Error('这个任务尚未解锁，请先完成上一任务');
      switchView('missions'); renderMission(input.missionId);
      return { missionId:input.missionId, title:MISSIONS[index].title, stage:missionStage(input.missionId) };
    }
  });

  register({
    name: 'start_physics_practice', title: '开始物理题目训练',
    description: '按知识链和难度打开一道原创初中物理题，显示在同一个训练界面。',
    inputSchema: { type:'object', properties:{ group:{ type:'string', enum:['all',...GROUPS.map(item=>item.id)] }, level:{ type:'string', enum:['all','基础','进阶','挑战'] } }, additionalProperties:false },
    annotations: { readOnlyHint:false, untrustedContentHint:false },
    execute(input={}) {
      const group = input.group || 'all', level = input.level || 'all';
      if (!['all',...GROUPS.map(item=>item.id)].includes(group)) throw new Error('未知知识链');
      if (!['all','基础','进阶','挑战'].includes(level)) throw new Error('未知难度');
      $('#practiceGroup').value=group; $('#practiceLevel').value=level; wrongOnly=false; choosePracticeQuestion(); switchView('practice');
      return { questionId:currentQuestion?.id || null, group, level };
    }
  });

}

registerWebMcpTools();
