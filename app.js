(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const SAVE_KEY = 'counttrash-save-v1';
  const PROFILE_KEY = 'counttrash-profile-v1';
  const SETTINGS_KEY = 'counttrash-settings-v1';
  const dialogs = Object.fromEntries(['new-game-modal','profile-modal','settings-modal','saves-modal','game-modal'].map(id => [id, document.getElementById(id)]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  let saves = read(SAVE_KEY, []);
  if (!Array.isArray(saves)) saves = [];
  let profile = read(PROFILE_KEY, {name:'Гравець'});
  if (!profile || typeof profile !== 'object') profile = {name:'Гравець'};
  let settings = read(SETTINGS_KEY, {sound:true,motion:true,hints:true});
  if (!settings || typeof settings !== 'object') settings = {sound:true,motion:true,hints:true};
  let pendingAvatar = typeof profile.avatar === 'string' ? profile.avatar : '';
  let currentSaveId = null;
  let toastTimer = null;
  let caseTimer = null;
  let caseCanClose = false;

  const icon = {
    shop:'<svg viewBox="0 0 24 24"><path d="M3 10h18l-2-6H5l-2 6Zm2 0v10h14V10M9 20v-6h6v6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>',
    fuel:'<svg viewBox="0 0 24 24"><path d="M5 21V4h10v17M3 21h14M8 8h4m6-1 2 2v8a2 2 0 0 0 4 0v-6l-3-3m-1 0V5"/></svg>',
    garage:'<svg viewBox="0 0 24 24"><path d="M3 10 12 4l9 6v11H3zM7 21v-7h10v7m-9-11h8m-8 2h8"/></svg>',
    warehouse:'<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5v12H3zM3 9l9 5 9-5M12 14v7m-5-8v8m10-8v8"/></svg>',
    home:'<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10H3zM8 21v-7h8v7m-8-9h.01M16 12h.01"/></svg>'
  };
  const CATALOG = [
    {id:'market',name:'Міні-маркет',kind:'business',cost:12000,income:190,icon:icon.shop,desc:'Постійний потік покупців'},
    {id:'garage',name:'Автомайстерня',kind:'business',cost:28000,income:520,icon:icon.garage,desc:'Ремонт і тюнінг авто'},
    {id:'fuel',name:'Заправка',kind:'business',cost:37000,income:710,icon:icon.fuel,desc:'Пальне для всього району'},
    {id:'warehouse',name:'Логістичний склад',kind:'business',cost:49000,income:980,icon:icon.warehouse,desc:'Вантажі ніколи не сплять'},
    {id:'home',name:'Житловий будинок',kind:'housing',cost:18000,income:105,population:120,icon:icon.home,desc:'+120 мешканців · стабільна оренда'}
  ];
  const LOTS = [{x:18,y:28},{x:47,y:26},{x:76,y:30},{x:28,y:70},{x:59,y:68},{x:83,y:70}];
  const REWARDS = {
    cars:[
      {name:'Уживаний седан',value:3200,rarity:'common',weight:36},
      {name:'Міський хетчбек',value:7800,rarity:'common',weight:30},
      {name:'Класичне купе',value:18500,rarity:'rare',weight:19},
      {name:'Спортивний суперкар',value:46000,rarity:'epic',weight:11},
      {name:'Колекційний GT',value:105000,rarity:'legendary',weight:4}
    ],
    arms:[
      {name:'Компактний пістолет',value:3800,rarity:'common',weight:36},
      {name:'Польовий карабін',value:9500,rarity:'common',weight:30},
      {name:'Тактична гвинтівка',value:24000,rarity:'rare',weight:19},
      {name:'Рідкісний прототип',value:58000,rarity:'epic',weight:11},
      {name:'Колекційний арсенал',value:115000,rarity:'legendary',weight:4}
    ]
  };

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function money(value) { return '$ ' + Math.floor(Number(value) || 0).toLocaleString('en-US'); }
  function cityName(save) { return save.cityName || save.business || 'Портове місто'; }
  function showToast(text) {
    const toast = $('#toast'); toast.textContent = text; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }
  function saveData(save = getCurrent()) {
    if (!save) return;
    save.date = new Date().toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'});
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saves)); } catch { showToast('Не вистачило місця для збереження.'); }
    updateSaves();
  }
  function getCurrent() { return saves.find(item => item.id === currentSaveId) || null; }
  function normalizeSave(save) {
    save.cityName = cityName(save);
    if (!Number.isFinite(Number(save.cash))) save.cash = 70000;
    else save.cash = Number(save.cash);
    if (!Array.isArray(save.buildings)) save.buildings = [];
    if (!Number.isFinite(Number(save.population))) save.population = 1200;
    if (!Number.isFinite(Number(save.casesOpened))) save.casesOpened = 0;
    if (!Number.isFinite(Number(save.lastTick))) save.lastTick = Date.now();
    return save;
  }
  function closeDialogs(except = null) { Object.values(dialogs).forEach(d => { if (d !== except && d.open) d.close(); }); }
  function openDialog(name) { const d = dialogs[name]; if (!d) return; closeDialogs(d); if (!d.open) d.showModal(); }
  function getName() { return typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Гравець'; }
  const avatarFallback = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></svg>';
  function renderAvatar(element, imageData) {
    element.replaceChildren();
    if (typeof imageData === 'string' && /^data:image\/(jpeg|png|webp);base64,/i.test(imageData)) {
      const img = document.createElement('img'); img.src = imageData; img.alt = ''; element.append(img);
    } else element.innerHTML = avatarFallback;
  }
  function updateProfile() { $('#top-name').textContent = getName(); renderAvatar($('#top-avatar'), profile.avatar || ''); }
  function fileToAvatar(file) {
    return new Promise((resolve,reject) => {
      const draw = (source,w,h,release=()=>{}) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
        const side = Math.min(w,h), context = canvas.getContext('2d');
        context.drawImage(source,(w-side)/2,(h-side)/2,side,side,0,0,320,320); release(); resolve(canvas.toDataURL('image/jpeg',.82));
      };
      if ('createImageBitmap' in window) { createImageBitmap(file).then(bitmap => draw(bitmap,bitmap.width,bitmap.height,()=>bitmap.close())).catch(reject); return; }
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => draw(img,img.naturalWidth,img.naturalHeight,()=>URL.revokeObjectURL(url));
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); }; img.src = url;
    });
  }

  function updateSaves() {
    $('#save-count').textContent = saves.length;
    const latest = saves[0];
    $('#recent-save-name').textContent = latest ? cityName(latest) : 'ЩЕ НЕМАЄ ЗБЕРЕЖЕНИХ ІГОР';
    $('#recent-save-detail').textContent = latest ? `${money(latest.cash ?? 70000)} · ${latest.buildings?.length || 0} будівель · ${latest.date || 'Щойно'}` : 'Створи нову гру, щоб розпочати свою історію.';
    $('#continue-button').disabled = !latest;
    $('#continue-button').setAttribute('aria-label', latest ? `Продовжити місто ${cityName(latest)}` : 'Немає збережених ігор');
    const list = $('#saves-list');
    if (!saves.length) { list.innerHTML = '<div class="empty-saves">Ще немає збережених міст.<br>Створи своє перше місто.</div>'; return; }
    list.innerHTML = saves.map(save => `<div class="save-row"><span class="save-symbol">${icon.warehouse}</span><span class="save-info"><b>${escapeHtml(cityName(save))}</b><small>${money(save.cash ?? 70000)} · ${save.buildings?.length || 0} будівель · ${escapeHtml(save.date || 'Щойно')}</small></span><button class="load-save" data-load="${escapeHtml(save.id)}">ГРАТИ <svg viewBox="0 0 20 20"><path d="M4 10h11M10 5l5 5-5 5"/></svg></button></div>`).join('');
    $$('[data-load]',list).forEach(btn => btn.addEventListener('click',()=>launchGame(btn.dataset.load)));
  }
  function setActiveNav(view) {
    $$('[data-view]').forEach(item=>item.classList.toggle('active',item.dataset.view===view));
    $('#breadcrumb-current').textContent = view==='saves'?'ЗБЕРЕЖЕНІ ІГРИ':'ГОЛОВНА';
  }
  function incomePerMinute(save) { return save.buildings.reduce((sum,b)=>sum+(CATALOG.find(item=>item.id===b.type)?.income||0),0); }
  function updateCity() {
    const save = getCurrent(); if (!save) return;
    normalizeSave(save);
    $('#game-title').textContent = cityName(save).toLocaleUpperCase('uk');
    $('#city-heading').textContent = cityName(save).toLocaleUpperCase('uk');
    $('#city-cash').textContent = money(save.cash); $('#container-cash').textContent = money(save.cash);
    $('#city-income').textContent = money(incomePerMinute(save));
    $('#city-population').textContent = Number(save.population).toLocaleString('uk-UA');
    $('#building-count').textContent = `${save.buildings.length} / ${LOTS.length}`;
    $('#build-panel-count').textContent = `${save.buildings.length}/${LOTS.length}`;
    $('#cases-count').textContent = Number(save.casesOpened)||0;
    const map = $('#map-lots');
    map.innerHTML = LOTS.map((pos,index)=>{
      const building=save.buildings[index];
      if(!building) return `<div class="city-lot empty" style="--x:${pos.x}%;--y:${pos.y}%"><span class="lot-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><b>ВІЛЬНА ДІЛЯНКА</b></div>`;
      const item=CATALOG.find(entry=>entry.id===building.type);
      return `<div class="city-lot occupied" style="--x:${pos.x}%;--y:${pos.y}%"><span class="lot-icon">${item?.icon||icon.warehouse}</span><b>${escapeHtml(item?.name||building.name||'Будівля')}</b><small>+${money(item?.income||0)}/ХВ</small></div>`;
    }).join('');
    const buildList=$('#build-list');
    buildList.innerHTML=CATALOG.map(item=>`<article class="build-card"><span class="build-icon">${item.icon}</span><span class="build-copy"><b>${item.name}</b><small>${item.desc}<br><strong>+${money(item.income)}/хв</strong></small></span><button class="build-buy" data-build="${item.id}" ${save.cash<item.cost||save.buildings.length>=LOTS.length?'disabled':''}>${money(item.cost)}</button></article>`).join('');
    $$('[data-build]',buildList).forEach(btn=>btn.addEventListener('click',()=>build(itemById(btn.dataset.build))));
    renderCaseBalance();
  }
  function itemById(id) { return CATALOG.find(item=>item.id===id); }
  function build(item) {
    const save=getCurrent(); if(!save||!item)return;
    if(save.buildings.length>=LOTS.length){showToast('Усі ділянки вже забудовані.');return;}
    if(save.cash<item.cost){showToast('Не вистачає коштів для будівництва.');return;}
    save.cash-=item.cost; save.buildings.push({type:item.id,name:item.name});
    if(item.population) save.population+=item.population;
    save.lastTick=Date.now(); saveData(save); updateCity();
    showToast(`${item.name} збудовано. Дохід +${money(item.income)} за хвилину.`);
  }
  function renderCaseBalance() { const save=getCurrent(); if(save) $('#container-cash').textContent=money(save.cash); }
  function launchGame(id) {
    const save=saves.find(item=>item.id===id); if(!save)return;
    normalizeSave(save); currentSaveId=save.id; save.lastTick=Date.now();
    switchGameTab('city'); updateCity(); openDialog('game-modal');
  }
  function switchGameTab(tab) {
    $$('.game-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.gameTab===tab));
    $$('.game-view').forEach(view=>{const selected=view.id===`${tab}-view`;view.hidden=!selected;view.classList.toggle('active',selected);});
    if(tab==='city') updateCity();
    if(tab==='containers') renderCaseBalance();
  }
  function closeGame() {
    const save=getCurrent(); if(save){save.lastTick=Date.now();saveData(save);}
    if(dialogs['game-modal'].open) dialogs['game-modal'].close();
    currentSaveId=null; showToast('Місто збережено. До зустрічі!');
  }

  $$('[data-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.action;
    if(action==='new'){closeDialogs();$('#city-name').value='';openDialog('new-game-modal');setTimeout(()=>$('#city-name').focus(),80);}
    if(action==='profile'){ $('#player-name').value=getName();pendingAvatar=profile.avatar||'';$('#avatar-input').value='';renderAvatar($('#avatar-preview'),pendingAvatar);openDialog('profile-modal'); }
    if(action==='settings')openDialog('settings-modal');
  }));
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    setActiveNav(button.dataset.view);
    if(button.dataset.view==='saves'){updateSaves();openDialog('saves-modal');}
    else {closeDialogs();window.scrollTo({top:0,behavior:'smooth'});}
  }));
  $$('[data-game-tab]').forEach(button=>button.addEventListener('click',()=>switchGameTab(button.dataset.gameTab)));
  updateProfile(); updateSaves();
  $('#new-game-form').addEventListener('submit',event=>{
    event.preventDefault();const name=$('#city-name').value.trim();if(!name)return;
    const save={id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`,cityName:name,business:name,cash:70000,population:1200,buildings:[],casesOpened:0,lastTick:Date.now(),date:new Date().toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'})};
    saves.unshift(save);currentSaveId=save.id;saveData(save);updateCity();switchGameTab('city');openDialog('game-modal');
  });
  $('#exit-game').addEventListener('click',closeGame);
  $('#game-modal').addEventListener('cancel',event=>{event.preventDefault();if(!$('#case-overlay').hidden){if(caseCanClose)hideCaseOverlay();return;}closeGame();});
  $('#continue-button').addEventListener('click',()=>{if(saves[0])launchGame(saves[0].id);});
  function weightedReward(type){const items=REWARDS[type];let roll=Math.random()*items.reduce((s,x)=>s+x.weight,0);for(const item of items){roll-=item.weight;if(roll<=0)return item;}return items[0];}
  function startCase(type){
    const save=getCurrent();if(!save)return;
    const price=type==='cars'?6500:9000;
    if(save.cash<price){showToast('Не вистачає коштів на цей контейнер.');return;}
    save.cash-=price;save.lastTick=Date.now();saveData(save);updateCity();
    const reward=weightedReward(type),src=type==='cars'?'public/container-cars.jpg':'public/container-arms.jpg';
    const track=$('#roulette-track'),winnerIndex=15;
    const cards=Array.from({length:19},(_,i)=>i===winnerIndex?reward:weightedReward(type));
    track.innerHTML=cards.map((item,i)=>`<div class="roulette-item ${item.rarity}" data-index="${i}"><img src="${src}" alt=""/><small>${item.rarity==='legendary'?'★ ЛЕГЕНДАРНЕ':item.rarity==='epic'?'◆ ЕПІЧНЕ':item.rarity==='rare'?'● РІДКІСНЕ':'ЗВИЧАЙНЕ'}</small><span>${escapeHtml(item.name)}</span></div>`).join('');
    $('#case-opening-title').textContent=type==='cars'?'АВТОМОБІЛЬНИЙ КОНТЕЙНЕР':'КОНТЕЙНЕР З АРСЕНАЛОМ';
    $('#case-opening-subtitle').textContent='Вантаж на шляху…';$('#case-result').hidden=true;$('#case-close').disabled=true;caseCanClose=false;
    const overlay=$('#case-overlay');overlay.hidden=false;track.style.transition='none';track.style.transform='translateX(0px)';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const winner=track.querySelector(`[data-index="${winnerIndex}"]`),windowBox=$('.roulette-window');
      const offset=windowBox.clientWidth/2-(winner.offsetLeft+winner.offsetWidth/2);
      track.style.transition='transform 4.7s cubic-bezier(.12,.72,.08,1)';track.style.transform=`translateX(${offset}px)`;
    }));
    let settled=false;
    const finish=()=>{if(settled)return;settled=true;clearTimeout(caseTimer);save.cash+=reward.value;save.casesOpened=(save.casesOpened||0)+1;save.lastTick=Date.now();saveData(save);updateCity();$('#case-opening-subtitle').textContent='Контейнер відкрито. Ось що тобі дісталось:';$('#result-name').textContent=reward.name.toLocaleUpperCase('uk');$('#result-value').textContent=`+${money(reward.value)}`;$('#case-result').hidden=false;$('#case-close').disabled=false;caseCanClose=true;};
    track.addEventListener('transitionend',finish,{once:true});caseTimer=setTimeout(finish,5100);
  }
  $$('[data-open-case]').forEach(button=>button.addEventListener('click',()=>startCase(button.dataset.openCase)));
  function hideCaseOverlay(){clearTimeout(caseTimer);$('#case-overlay').hidden=true;$('#roulette-track').style.transition='none';$('#roulette-track').style.transform='translateX(0)';caseCanClose=false;}
  $('#case-close').addEventListener('click',()=>{if(caseCanClose)hideCaseOverlay();});
  $('#collect-result').addEventListener('click',hideCaseOverlay);

  $('#avatar-pick').addEventListener('click',()=>$('#avatar-input').click());
  $('#avatar-input').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){showToast('Обери файл зображення.');return;}if(file.size>20*1024*1024){showToast('Фото завелике. Максимум — 20 МБ.');return;}try{pendingAvatar=await fileToAvatar(file);renderAvatar($('#avatar-preview'),pendingAvatar);}catch{showToast('Не вдалося завантажити це фото. Спробуй інше.');}});
  $('#avatar-remove').addEventListener('click',()=>{pendingAvatar='';$('#avatar-input').value='';renderAvatar($('#avatar-preview'),'');});
  $('#profile-form').addEventListener('submit',event=>{event.preventDefault();const name=$('#player-name').value.trim();if(!name)return;profile={name,avatar:pendingAvatar};try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));}catch{showToast('Не вдалося зберегти фото.');return;}updateProfile();closeDialogs();showToast('Профіль оновлено.');});
  ['sound','motion','hints'].forEach(key=>{const input=$(`#${key}-toggle`);input.checked=settings[key]!==false;input.addEventListener('change',()=>{settings[key]=input.checked;try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}document.body.classList.toggle('reduce-motion',settings.motion===false);});});
  $('#settings-done').addEventListener('click',()=>{closeDialogs();showToast('Налаштування збережено.');});

  setInterval(()=>{
    const save=getCurrent();if(!save||!dialogs['game-modal'].open||!$('#case-overlay').hidden)return;
    const now=Date.now(),elapsed=Math.max(0,Math.min(now-(Number(save.lastTick)||now),60*60*1000));
    const income=incomePerMinute(save);if(income>0&&elapsed>0)save.cash+=income*elapsed/60000;
    save.lastTick=now;try{localStorage.setItem(SAVE_KEY,JSON.stringify(saves));}catch{}
    $('#city-cash').textContent=money(save.cash);$('#container-cash').textContent=money(save.cash);$('#city-income').textContent=money(income);
    $$('[data-build]').forEach(btn=>{const item=itemById(btn.dataset.build);btn.disabled=!item||save.cash<item.cost||save.buildings.length>=LOTS.length;});
  },5000);
})();
