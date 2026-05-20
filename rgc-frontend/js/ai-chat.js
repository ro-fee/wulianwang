/**
 * AI Chat — DeepSeek-powered exercise coach (inline section)
 */
(function () {
  const messagesEl = document.getElementById('ai-chat-messages');
  const input = document.getElementById('ai-chat-input');

  function addMessage(role, text) {
    const isAI = role === 'ai';
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:10px;animation:fadeInUp .3s ease both';
    div.innerHTML =
      '<div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;' +
      (isAI
        ? 'background:rgba(0,229,255,.12);color:#00e5ff">AI'
        : 'background:rgba(255,107,107,.12);color:#ff6b6b">我') +
      '</div>' +
      '<div style="background:' + (isAI ? 'rgba(0,229,255,.06)' : 'rgba(255,107,107,.06)') +
      ';border:1px solid ' + (isAI ? 'rgba(0,229,255,.1)' : 'rgba(255,107,107,.1)') +
      ';border-radius:12px;padding:12px 14px;font-size:.88rem;color:#e8ecf2;line-height:1.65;max-width:85%;white-space:pre-wrap;word-break:break-word">' +
      escapeHtml(text) + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function callAI(messages) {
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages }),
      });
      const data = await resp.json();
      return data.reply || data.error || '（无回复）';
    } catch (e) {
      return '请求失败：' + e.message + '\n请确认桥接器已启动。';
    }
  }

  function collectExerciseData() {
    const userInfo = localStorage.getItem('userInfo');
    let user = { nickname: '未知', height: 170, weight: 60, age: 25, upperArmLength: 30, lowerArmLength: 30, sportsGoal: '保持健康' };
    if (userInfo) {
      try { user = Object.assign(user, JSON.parse(userInfo)); } catch (e) {}
    }

    return (
      '【用户信息】\n' +
      '昵称：' + user.nickname + '\n' +
      '身高：' + user.height + 'cm | 体重：' + user.weight + 'kg | 年龄：' + user.age + '岁\n' +
      '大臂长：' + user.upperArmLength + 'cm | 小臂长：' + user.lowerArmLength + 'cm\n' +
      '运动目标：' + user.sportsGoal + '\n\n' +
      '【运动数据说明】\n' +
      '当前显示的是最后一次连接设备时采集的数据。\n' +
      '足部压力：反映脚掌各区域的着地压力分布。\n' +
      '手臂关节角度：反映摆臂幅度、对称性和协调性。\n' +
      '3D模型：实时展示跑步姿态。\n\n' +
      '请根据上述用户身体参数，给出针对性的跑步姿态改进建议、训练计划和注意事项。'
    );
  }

  window.sendAutoAnalysis = async function () {
    addMessage('user', '请根据我的用户信息和运动数据，生成一份跑步姿态分析建议。');
    const data = collectExerciseData();
    addMessage('user', data);
    addMessage('ai', '⏳ 正在分析中...');
    const reply = await callAI([
      { role: 'user', content: data },
    ]);
    // Remove loading message
    messagesEl.removeChild(messagesEl.lastChild);
    addMessage('ai', reply);
  };

  window.sendMessage = async function () {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage('user', text);
    addMessage('ai', '⏳');
    const reply = await callAI([
      { role: 'user', content: text },
    ]);
    messagesEl.removeChild(messagesEl.lastChild);
    addMessage('ai', reply);
  };
})();
