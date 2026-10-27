(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE = 'counttrash-save-v1';
  const PROFILE_KEY = 'counttrash-profile-v1';
  const SETTINGS_KEY = 'counttrash-settings-v1';
  const dialogs = Object.fromEntries(['new-game-modal','profile-modal','settings-modal','saves-modal','game-modal'].map(id => [id, document.getElementById(id)]));
  const safeRead = (key, fallback) => { try { const data = localStorage.getItem(key); return data ? JSON.parse(data) : fallback; } catch { return fallback; } };
  let saves = safeRead(STORAGE, []);
  let profile = safeRead(PROFILE_KEY, {name:'Гравець'});
  let settings = safeRead(SETTINGS_KEY, {sound:true,motion:true,hints:true});
  let currentSaveId = null;
  let toastTimer;

  function showToast(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
  function closeDialogs(except) { Object.values(dialogs).forEach(dialog => { if (dialog !== except && dialog.open) dialog.close(); }); }
  function openDialog(name) { closeDialogs(dialogs[name]); dialogs[name].showModal(); }
  function getName() { return profile.name || 'Гравець'; }
  function updateProfile() {
    const name = getName(); $('#top-name').textContent = name; $('#avatar-initial').textContent = [...name.trim()][0]?.toLocaleUpperCase('uk') || 'Г'; $('#profile-label').textContent = name.toLocaleUpperCase('uk');
  }
  function updateSaves() {
    $('#save-count').textContent = saves.length;
    $('#resume-label').textContent = saves.length ? `${saves.length} ЗБЕРЕЖЕН${saves.length === 1 ? 'НЯ' : 'ИХ ІГОР'}` : 'НЕМАЄ ЗБЕРЕЖЕНЬ';
    const list = $('#saves-list');
    if (!saves.length) {
      list.innerHTML = '<div class="empty-saves">Тут поки тихо — жодної гри ще не збережено.<br>Створи свою першу імперію, босе.</div>';
      return;
    }
    list.innerHTML = saves.map(save => `<div class="save-row"><span class="save-symbol">▤</span><span class="save-info"><b>${escapeHtml(save.business)}</b><small>${escapeHtml(save.difficultyLabel)} · ${escapeHtml(save.date || 'Щойно')}</small></span><button class="load-save" data-load="${escapeHtml(save.id)}">ПРОДОВЖИТИ</button></div>`).join('');
    $$('[data-load]', list).forEach(button => button.addEventListener('click', () => launchGame(button.dataset.load)));
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
  function setActiveNav(view) {
    $$('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    $('#breadcrumb-current').textContent = view === 'saves' ? 'ЗБЕРЕЖЕНІ ІГРИ' : 'ГОЛОВНА';
  }
  function launchGame(id) {
    const save = saves.find(item => item.id === id);
    if (!save) return;
    currentSaveId = save.id; $('#game-title').textContent = save.business.toLocaleUpperCase('uk'); $('#game-difficulty').textContent = save.difficultyLabel;
    closeDialogs(); openDialog('game-modal');
  }
  function applySettings() {
    $('#sound-toggle').checked = settings.sound !== false; $('#motion-toggle').checked = settings.motion !== false; $('#hints-toggle').checked = settings.hints !== false;
    document.body.classList.toggle('reduce-motion', settings.motion === false);
  }
  function bindActions(root = document) {
    $$('[data-action]', root).forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'new') { closeDialogs(); $('#business-name').value = ''; openDialog('new-game-modal'); setTimeout(() => $('#business-name').focus(), 80); }
      if (action === 'profile') { $('#player-name').value = getName(); openDialog('profile-modal'); }
      if (action === 'settings') openDialog('settings-modal');
    }));
    $$('[data-view]', root).forEach(button => button.addEventListener('click', () => {
      const view = button.dataset.view; setActiveNav(view);
      if (view === 'saves') { updateSaves(); openDialog('saves-modal'); }
      else { closeDialogs(); window.scrollTo({top:0,behavior:'smooth'}); }
    }));
  }
  bindActions(); updateProfile(); updateSaves(); applySettings();

  $('#new-game-form').addEventListener('submit', event => {
    event.preventDefault();
    const business = $('#business-name').value.trim(); if (!business) return;
    const difficulty = $('input[name="difficulty"]:checked').value;
    const now = new Date();
    const save = {id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),business,difficulty,difficultyLabel:difficulty === 'hard' ? 'Жорстко' : 'Стандарт',date:now.toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'})};
    saves.unshift(save); localStorage.setItem(STORAGE, JSON.stringify(saves)); updateSaves(); currentSaveId = save.id;
    $('#game-title').textContent = business.toLocaleUpperCase('uk'); $('#game-difficulty').textContent = save.difficultyLabel.toLocaleUpperCase('uk');
    closeDialogs(); openDialog('game-modal');
  });
  $$('.difficulty-option').forEach(option => option.addEventListener('click', () => {
    $$('.difficulty-option').forEach(item => item.classList.remove('selected')); option.classList.add('selected'); $('input', option).checked = true;
  }));
  $('#profile-form').addEventListener('submit', event => {
    event.preventDefault(); const name = $('#player-name').value.trim(); if (!name) return;
    profile = {name}; localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); updateProfile(); closeDialogs(); showToast('Профіль оновлено. Тепер порт знає твоє ім’я.');
  });
  ['sound','motion','hints'].forEach(key => $(`#${key}-toggle`).addEventListener('change', event => {
    settings[key] = event.target.checked; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); applySettings();
  }));
  $('#settings-done').addEventListener('click', () => { closeDialogs(); showToast('Налаштування збережено.'); });
  $('#save-game').addEventListener('click', () => {
    const save = saves.find(item => item.id === currentSaveId);
    if (save) { save.date = new Date().toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'}); localStorage.setItem(STORAGE, JSON.stringify(saves)); updateSaves(); }
    closeDialogs(); showToast('Гру збережено. Побачимось у порту, босе.');
  });
  $('.notification-button').addEventListener('click', () => showToast('Поки тихо. Твій порт чекає на перший вантаж.'));
  $('#saves-modal').addEventListener('click', event => { if (event.target === $('#saves-modal')) $('#saves-modal').close(); });
})();
