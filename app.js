(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE = 'counttrash-save-v1';
  const PROFILE_KEY = 'counttrash-profile-v1';
  const SETTINGS_KEY = 'counttrash-settings-v1';
  const dialogIds = ['new-game-modal', 'profile-modal', 'settings-modal', 'saves-modal', 'game-modal'];
  const dialogs = Object.fromEntries(dialogIds.map(id => [id, document.getElementById(id)]));
  const safeRead = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch { return fallback; }
  };
  let saves = safeRead(STORAGE, []);
  if (!Array.isArray(saves)) saves = [];
  let profile = safeRead(PROFILE_KEY, { name: 'Гравець' });
  if (!profile || typeof profile !== 'object') profile = { name: 'Гравець' };
  let settings = safeRead(SETTINGS_KEY, { sound: true, motion: true, hints: true });
  if (!settings || typeof settings !== 'object') settings = { sound: true, motion: true, hints: true };
  let currentSaveId = null;
  let toastTimer;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
  function closeDialogs(except = null) {
    Object.values(dialogs).forEach(dialog => {
      if (dialog !== except && dialog.open) dialog.close();
    });
  }
  function openDialog(name) {
    const dialog = dialogs[name];
    if (!dialog) return;
    closeDialogs(dialog);
    if (!dialog.open) dialog.showModal();
  }
  function getName() {
    return typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Гравець';
  }
  function updateProfile() {
    $('#top-name').textContent = getName();
  }
  function updateSaves() {
    $('#save-count').textContent = saves.length;
    const latest = saves[0];
    const recentName = $('#recent-save-name');
    const recentDetail = $('#recent-save-detail');
    const continueButton = $('#continue-button');
    if (latest) {
      recentName.textContent = latest.business;
      recentDetail.textContent = `${latest.difficultyLabel || 'Стандарт'} · Останнє збереження: ${latest.date || 'Щойно'}`;
      continueButton.disabled = false;
      continueButton.setAttribute('aria-label', `Продовжити гру: ${latest.business}`);
    } else {
      recentName.textContent = 'ЩЕ НЕМАЄ ЗБЕРЕЖЕНИХ ІГОР';
      recentDetail.textContent = 'Створи нову гру, щоб розпочати свою історію.';
      continueButton.disabled = true;
      continueButton.setAttribute('aria-label', 'Немає збережених ігор');
    }

    const list = $('#saves-list');
    if (!saves.length) {
      list.innerHTML = '<div class="empty-saves">Ще немає збережених ігор.<br>Створи нову гру, щоб розпочати свою історію.</div>';
      return;
    }
    list.innerHTML = saves.map(save => `<div class="save-row"><span class="save-symbol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7.5 8-4.5 8 4.5v9L12 21l-8-4.5zM4 7.5 12 12l8-4.5M12 12v9"/></svg></span><span class="save-info"><b>${escapeHtml(save.business || 'Бізнес')}</b><small>${escapeHtml(save.difficultyLabel || 'Стандарт')} · ${escapeHtml(save.date || 'Щойно')}</small></span><button class="load-save" data-load="${escapeHtml(save.id)}">ГРАТИ <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M10 5l5 5-5 5"/></svg></button></div>`).join('');
    $$('[data-load]', list).forEach(button => button.addEventListener('click', () => launchGame(button.dataset.load)));
  }
  function setActiveNav(view) {
    $$('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    $('#breadcrumb-current').textContent = view === 'saves' ? 'ЗБЕРЕЖЕНІ ІГРИ' : 'ГОЛОВНА';
  }
  function launchGame(id) {
    const save = saves.find(item => item.id === id);
    if (!save) return;
    currentSaveId = save.id;
    $('#game-title').textContent = (save.business || 'БІЗНЕС').toLocaleUpperCase('uk');
    $('#game-difficulty').textContent = (save.difficultyLabel || 'Стандарт').toLocaleUpperCase('uk');
    openDialog('game-modal');
  }
  function applySettings() {
    $('#sound-toggle').checked = settings.sound !== false;
    $('#motion-toggle').checked = settings.motion !== false;
    $('#hints-toggle').checked = settings.hints !== false;
    document.body.classList.toggle('reduce-motion', settings.motion === false);
  }
  function handleAction(action) {
    if (action === 'new') {
      closeDialogs();
      $('#business-name').value = '';
      openDialog('new-game-modal');
      setTimeout(() => $('#business-name').focus(), 80);
    }
    if (action === 'profile') {
      $('#player-name').value = getName();
      openDialog('profile-modal');
    }
    if (action === 'settings') openDialog('settings-modal');
  }
  $$('[data-action]').forEach(button => button.addEventListener('click', () => handleAction(button.dataset.action)));
  $$('[data-view]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.view;
    setActiveNav(view);
    if (view === 'saves') {
      updateSaves();
      openDialog('saves-modal');
    } else {
      closeDialogs();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }));
  updateProfile();
  updateSaves();
  applySettings();

  $('#new-game-form').addEventListener('submit', event => {
    event.preventDefault();
    const business = $('#business-name').value.trim();
    if (!business) return;
    const difficulty = $('input[name="difficulty"]:checked').value;
    const save = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      business,
      difficulty,
      difficultyLabel: difficulty === 'hard' ? 'Жорстко' : 'Стандарт',
      date: new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
    };
    saves.unshift(save);
    try { localStorage.setItem(STORAGE, JSON.stringify(saves)); } catch { showToast('Не вдалося зберегти гру на цьому пристрої.'); }
    currentSaveId = save.id;
    updateSaves();
    $('#game-title').textContent = business.toLocaleUpperCase('uk');
    $('#game-difficulty').textContent = save.difficultyLabel.toLocaleUpperCase('uk');
    openDialog('game-modal');
  });
  $$('.difficulty-option').forEach(option => option.addEventListener('click', () => {
    $$('.difficulty-option').forEach(item => item.classList.remove('selected'));
    option.classList.add('selected');
    $('input', option).checked = true;
  }));
  $('#profile-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#player-name').value.trim();
    if (!name) return;
    profile = { name };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* Keep the change for this session. */ }
    updateProfile();
    closeDialogs();
    showToast('Профіль оновлено.');
  });
  ['sound', 'motion', 'hints'].forEach(key => $(`#${key}-toggle`).addEventListener('change', event => {
    settings[key] = event.target.checked;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Keep the change for this session. */ }
    applySettings();
  }));
  $('#settings-done').addEventListener('click', () => {
    closeDialogs();
    showToast('Налаштування збережено.');
  });
  $('#continue-button').addEventListener('click', () => {
    if (saves[0]) launchGame(saves[0].id);
  });
  $('#save-game').addEventListener('click', () => {
    const save = saves.find(item => item.id === currentSaveId);
    if (save) {
      save.date = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' });
      try { localStorage.setItem(STORAGE, JSON.stringify(saves)); } catch { /* Keep the save for this session. */ }
      updateSaves();
    }
    closeDialogs();
    showToast('Гру збережено. Побачимось у порту.');
  });
})();
