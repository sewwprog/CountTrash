(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const SAVE_KEY = 'counttrash-save-v1';
  const PROFILE_KEY = 'counttrash-profile-v1';
  const SETTINGS_KEY = 'counttrash-settings-v1';
  const dialogs = Object.fromEntries(['new-game-modal','profile-modal','settings-modal','saves-modal','game-modal'].map(id => [id, document.getElementById(id)]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const finiteNumber = (value,fallback=0) => { const number=Number(value); return Number.isFinite(number)?number:fallback; };
  let saves = read(SAVE_KEY, []);
  if (!Array.isArray(saves)) saves = [];
  saves = saves.filter(save => save && typeof save === 'object' && !Array.isArray(save));
  const usedSaveIds = new Set();
  saves.forEach((save,index) => {
    let id = typeof save.id === 'string' || typeof save.id === 'number' ? String(save.id).trim() : '';
    if (!id || usedSaveIds.has(id)) id = globalThis.crypto?.randomUUID?.() || `legacy-${Date.now()}-${index}`;
    save.id = id; usedSaveIds.add(id);
  });
  let profile = read(PROFILE_KEY, {name:'Гравець'});
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) profile = {name:'Гравець'};
  const legacyNameParts=typeof profile.name==='string'?profile.name.trim().split(/\s+/).filter(Boolean):[];
  profile.firstName=typeof profile.firstName==='string'?profile.firstName:(legacyNameParts[0]||'');
  profile.lastName=typeof profile.lastName==='string'?profile.lastName:legacyNameParts.slice(1).join(' ');
  profile.dailyClaimDay=typeof profile.dailyClaimDay==='string'?profile.dailyClaimDay:'';
  profile.dailyStreak=Math.max(0,Math.min(7,Math.floor(finiteNumber(profile.dailyStreak))));
  profile.dailyLastReward=Math.max(0,finiteNumber(profile.dailyLastReward));
  profile.pendingBonus=Math.max(0,finiteNumber(profile.pendingBonus));
  let settings = read(SETTINGS_KEY, {sound:true,motion:true,hints:true});
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {sound:true,motion:true,hints:true};
  let pendingAvatar = typeof profile.avatar === 'string' ? profile.avatar : '';
  let currentSaveId = null;
  let toastTimer = null;
  let caseTimer = null;
  let audioContext = null;
  let caseCanClose = false;
  let pendingBuildId = null;
  let selectedBuildingIndex = null;
  let movingBuildingIndex = null;
  let confirmingRemoval = false;
  let buildPanelOpen = false;
  let buildFilter = 'all';
  let mapZoom = 1;
  let mapOffsetX = 0;
  let mapOffsetY = 0;
  let mapGesture = null;
  let suppressMapClickUntil = 0;
  const MAX_BUILDINGS = 48;
  const DAILY_BONUSES = [500,750,1000,1250,1500,2000,3000];

  const icon = {
    shop:'<svg viewBox="0 0 24 24"><path d="M3 10h18l-2-6H5l-2 6Zm2 0v10h14V10M9 20v-6h6v6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>',
    fuel:'<svg viewBox="0 0 24 24"><path d="M5 21V4h10v17M3 21h14M8 8h4m6-1 2 2v8a2 2 0 0 0 4 0v-6l-3-3m-1 0V5"/></svg>',
    garage:'<svg viewBox="0 0 24 24"><path d="M3 10 12 4l9 6v11H3zM7 21v-7h10v7m-9-11h8m-8 2h8"/></svg>',
    warehouse:'<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5v12H3zM3 9l9 5 9-5M12 14v7m-5-8v8m10-8v8"/></svg>',
    home:'<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10H3zM8 21v-7h8v7m-8-9h.01M16 12h.01"/></svg>',
    park:'<svg viewBox="0 0 24 24"><path d="M12 3 7 9h3l-4 5h4v7h4v-7h4l-4-5h3zM3 21h18"/></svg>',
    school:'<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5v11H3zM3 9l9 5 9-5M8 20v-5h8v5m-4-11v.01"/></svg>',
    clinic:'<svg viewBox="0 0 24 24"><path d="M4 21V5h16v16M2 21h20M12 8v7m-3.5-3.5h7M8 5V3h8v2"/></svg>',
    bank:'<svg viewBox="0 0 24 24"><path d="m3 9 9-6 9 6H3zm2 2v7m5-7v7m4-7v7m5-7v7M3 21h18M2 18h20"/></svg>',
    power:'<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 10-13h-7z"/></svg>',
    mall:'<svg viewBox="0 0 24 24"><path d="M3 10h18l-2-6H5l-2 6Zm2 0v10h14V10M9 20v-6h6v6M12 4v6"/></svg>'
  };
  const CATALOG = [
    {id:'market',name:'Міні-маркет',kind:'business',cost:12000,income:190,icon:icon.shop,desc:'Постійний потік покупців'},
    {id:'garage',name:'Автомайстерня',kind:'business',cost:28000,income:520,icon:icon.garage,desc:'Ремонт і тюнінг авто'},
    {id:'fuel',name:'Заправка',kind:'business',cost:37000,income:710,icon:icon.fuel,desc:'Пальне для всього району'},
    {id:'warehouse',name:'Логістичний склад',kind:'business',cost:49000,income:980,icon:icon.warehouse,desc:'Вантажі ніколи не сплять'},
    {id:'home',name:'Житловий будинок',kind:'housing',cost:18000,income:105,population:120,icon:icon.home,desc:'+120 мешканців · стабільна оренда'},
    {id:'park',name:'Міський парк',kind:'civic',cost:16000,income:90,population:80,icon:icon.park,desc:'+80 мешканців · зелена зона'},
    {id:'school',name:'Школа',kind:'civic',cost:42000,income:260,population:220,icon:icon.school,desc:'+220 мешканців · освіта району'},
    {id:'clinic',name:'Медичний центр',kind:'civic',cost:58000,income:430,population:300,icon:icon.clinic,desc:'+300 мешканців · здорове місто'},
    {id:'bank',name:'Міський банк',kind:'business',cost:72000,income:1250,icon:icon.bank,desc:'Фінанси працюють цілодобово'},
    {id:'power',name:'Електростанція',kind:'business',cost:65000,income:1100,icon:icon.power,desc:'Енергія для всього району'},
    {id:'mall',name:'Торговий центр',kind:'business',cost:90000,income:1750,icon:icon.mall,desc:'Головний магніт для покупців'}
  ];
  const CASE_PRICES = {cars:35000,arms:2200};
  const REWARDS = {
    cars:[
      {name:'ВАЗ / Lada 2107 — розвалюха',value:900,marketPrice:900,rarity:'common',weight:32,image:'public/loot-lada-2107-wreck.jpg'},
      {name:'Daewoo Lanos — розвалюха',value:1500,marketPrice:1500,rarity:'common',weight:28,image:'public/loot-daewoo-lanos-wreck.jpg'},
      {name:'Mazda 3 (2015)',value:12500,marketPrice:12500,rarity:'common',weight:6,image:'public/loot-mazda-3-2015.jpg'},
      {name:'Honda Civic (2017)',value:14500,marketPrice:14500,rarity:'common',weight:5,image:'public/loot-honda-civic-2017.jpg'},
      {name:'Hyundai Elantra',value:22825,marketPrice:22825,rarity:'common',weight:8,image:'public/loot-hyundai-elantra.jpg'},
      {name:'Volkswagen Golf GTI',value:35865,marketPrice:35865,rarity:'common',weight:6,image:'public/loot-vw-golf.jpg'},
      {name:'Mercedes-AMG C 63',value:89350,marketPrice:89350,rarity:'rare',weight:6,image:'public/loot-mercedes-amg-c63.jpg'},
      {name:'Audi RS6 Avant',value:130700,marketPrice:130700,rarity:'epic',weight:3.5,image:'public/loot-audi-rs6.jpg'},
      {name:'BMW M3',value:79300,marketPrice:79300,rarity:'rare',weight:3,image:'public/loot-bmw-m3.jpg'},
      {name:'Porsche 911 GT3 RS',value:241300,marketPrice:241300,rarity:'epic',weight:1.5,image:'public/loot-porsche-911.jpg'},
      {name:'Ferrari SF90 Stradale',value:528764,marketPrice:528764,rarity:'epic',weight:.8,image:'public/loot-ferrari-sf90.jpg'},
      {name:'Bugatti Chiron',value:3300000,marketPrice:3300000,rarity:'legendary',weight:.2,image:'public/loot-bugatti-chiron.jpg'}
    ],
    arms:[
      {name:'Glock 17',value:250,rarity:'common',weight:37,image:'public/loot-glock-17.jpg'},
      {name:'MP5',value:500,rarity:'common',weight:31,image:'public/loot-mp5.jpg'},
      {name:'AK-47',value:1700,rarity:'rare',weight:18,image:'public/loot-ak47.jpg'},
      {name:'M4A1',value:7000,rarity:'epic',weight:9,image:'public/loot-m4a1.jpg'},
      {name:'Desert Eagle',value:15000,rarity:'epic',weight:4,image:'public/loot-desert-eagle.svg'},
      {name:'AWP',value:40000,rarity:'legendary',weight:1,image:'public/loot-awp.svg'}
    ]
  };

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function money(value) { return '$ ' + Math.floor(Number(value) || 0).toLocaleString('en-US'); }
  function cityName(save) {
    const name=typeof save?.cityName==='string'?save.cityName.trim():'';
    const legacy=typeof save?.business==='string'?save.business.trim():'';
    return name||legacy||'Портове місто';
  }
  function playNotificationSound() {
    if(settings.sound===false)return;
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    try {
      audioContext ||= new AudioContextClass();
      const play=()=>{
        const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime;
        oscillator.type='sine';oscillator.frequency.setValueAtTime(640,start);oscillator.frequency.exponentialRampToValueAtTime(880,start+.08);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.018,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.16);
        oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.17);
      };
      if(audioContext.state==='suspended')audioContext.resume().then(play).catch(()=>{});else play();
    } catch {}
  }
  function showToast(text) {
    playNotificationSound();
    const openModal = Object.values(dialogs).find(dialog => dialog.open);
    let toast;
    if (openModal?.id === 'game-modal') toast = $('#game-toast');
    else if (openModal) {
      toast = $('.modal-toast', openModal);
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast modal-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        openModal.append(toast);
      }
    } else toast = $('#toast');
    $$('.toast.show').forEach(item => item.classList.remove('show'));
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }
  function saveData(save = getCurrent()) {
    if (!save) return false;
    save.date = new Date().toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'});
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
      updateSaves();
      return true;
    } catch {
      updateSaves();showToast('Не вистачило місця для збереження.');
      return false;
    }
  }
  function getCurrent() { return saves.find(item => item.id === currentSaveId) || null; }
  function normalizeSave(save) {
    save.cityName = cityName(save);
    const cash = Number(save.cash),population = Number(save.population),casesOpened = Number(save.casesOpened),lastTick = Number(save.lastTick);
    save.cash = Number.isFinite(cash) ? Math.max(0,cash) : 70000;
    if (!Array.isArray(save.buildings)) save.buildings = [];
    save.buildings = save.buildings.filter(building => building && typeof building === 'object' && !Array.isArray(building));
    const legacyMap = !(Number(save.mapVersion) >= 2);
    save.population = Number.isFinite(population) ? Math.max(1200,population) : 1200;
    save.casesOpened = Number.isFinite(casesOpened) ? Math.max(0,Math.floor(casesOpened)) : 0;
    save.lastTick = Number.isFinite(lastTick) && lastTick > 0 ? lastTick : Date.now();
    save.buildings.forEach((building,index) => {
      const item = CATALOG.find(entry => entry.id === building.type);
      const fallback = {x:10+(index%7)*13.3,y:15+Math.floor(index/7)*10.5};
      const x = Number(building.x),y = Number(building.y),level = Number(building.level),invested = Number(building.invested),totalEarned = Number(building.totalEarned);
      building.x = Number.isFinite(x) ? legacyMap ? 18.75+Math.max(0,Math.min(100,x))*.625 : Math.max(0,Math.min(100,x)) : fallback.x;
      building.y = Number.isFinite(y) ? legacyMap ? 18.75+Math.max(0,Math.min(100,y))*.625 : Math.max(0,Math.min(100,y)) : fallback.y;
      building.level = Number.isFinite(level) ? Math.max(1,Math.min(5,Math.floor(level))) : 1;
      building.invested = Number.isFinite(invested) ? Math.max(0,invested) : (item?.cost||0);
      building.totalEarned = Number.isFinite(totalEarned) ? Math.max(0,totalEarned) : 0;
    });
    save.mapVersion=2;
    return save;
  }
  function closeDialogs(except = null) { Object.values(dialogs).forEach(d => { if (d !== except && d.open) d.close(); }); }
  function openDialog(name) { const d = dialogs[name]; if (!d) return; closeDialogs(d); if (!d.open) d.showModal(); }
  function openProfileDialog(fromGame=false) {
    const profileDialog=dialogs['profile-modal'],gameDialog=dialogs['game-modal'],keepGame=fromGame&&gameDialog.open;
    Object.values(dialogs).forEach(dialog=>{if(dialog===profileDialog||(keepGame&&dialog===gameDialog))return;if(dialog.open)dialog.close();});
    $('#player-first-name').value=profile.firstName||'';$('#player-last-name').value=profile.lastName||'';
    pendingAvatar=profile.avatar||'';$('#avatar-input').value='';renderAvatar($('#avatar-preview'),pendingAvatar);
    if(!profileDialog.open)profileDialog.showModal();
    updateDailyBonusUI();
  }
  function getName() {
    const fullName=[profile.firstName,profile.lastName].filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()).join(' ');
    return fullName||(typeof profile.name==='string'&&profile.name.trim()?profile.name.trim():'Гравець');
  }
  const avatarFallback = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></svg>';
  function renderAvatar(element, imageData) {
    element.replaceChildren();
    if (typeof imageData === 'string' && /^data:image\/(jpeg|png|webp);base64,/i.test(imageData)) {
      const img = document.createElement('img'); img.src = imageData; img.alt = ''; element.append(img);
    } else element.innerHTML = avatarFallback;
  }
  function updateProfile() {
    $('#top-name').textContent=getName();$('#game-profile-name').textContent=getName();
    renderAvatar($('#top-avatar'),profile.avatar||'');renderAvatar($('#game-profile-avatar'),profile.avatar||'');
  }
  function persistProfile() { try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));return true;}catch{return false;} }
  function applySettings() {
    document.body.classList.toggle('reduce-motion',settings.motion===false);
    document.body.classList.toggle('hide-hints',settings.hints===false);
  }
  function localDayKey(timestamp=Date.now()) {
    const date=new Date(timestamp),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
  function dailyBonusState() {
    const today=localDayKey(),yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
    const streak=Math.max(0,Math.min(7,Number(profile.dailyStreak)||0)),claimed=profile.dailyClaimDay===today;
    const nextStreak=profile.dailyClaimDay===localDayKey(yesterday.getTime())?(streak>=7?1:streak+1):1;
    const day=claimed?(streak||1):nextStreak;
    return {today,claimed,day,amount:claimed?(profile.dailyLastReward||DAILY_BONUSES[day-1]):DAILY_BONUSES[day-1]};
  }
  function updateDailyBonusUI() {
    const state=dailyBonusState(),completed=state.claimed?state.day:state.day-1;
    $('#daily-bonus-day').textContent=`ДЕНЬ ${state.day} / 7`;
    $('#daily-bonus-amount').textContent=`+ ${money(state.amount)}`;
    $('#daily-bonus-days').innerHTML=DAILY_BONUSES.map((amount,index)=>`<span class="daily-bonus-step ${index<completed?'claimed ':''}${index===state.day-1?'current':''}"><small>ДЕНЬ ${index+1}</small><b>${money(amount)}</b></span>`).join('');
    $('#daily-bonus-status').textContent=state.claimed?'Сьогоднішній бонус уже забрано. Повертайся завтра.':saves.length?'Забери бонус — він надійде в активне або останнє місто.':'Забери бонус зараз; він збережеться для твого першого міста.';
    const button=$('#daily-bonus-claim');button.disabled=state.claimed;button.querySelector('span').textContent=state.claimed?'ЗАБРАНО СЬОГОДНІ':'ЗАБРАТИ БОНУС';
  }
  function claimDailyBonus() {
    const state=dailyBonusState();if(state.claimed){showToast('Щоденний бонус уже забрано.');return;}
    const amount=state.amount,target=getCurrent()||saves[0]||null;
    const previous={day:profile.dailyClaimDay,streak:profile.dailyStreak,reward:profile.dailyLastReward,pending:profile.pendingBonus};
    let previousCash=null;
    profile.dailyClaimDay=state.today;profile.dailyStreak=state.day;profile.dailyLastReward=amount;
    if(target){
      normalizeSave(target);previousCash=target.cash;target.cash+=amount;
      if(!saveData(target)){
        target.cash=previousCash;profile.dailyClaimDay=previous.day;profile.dailyStreak=previous.streak;profile.dailyLastReward=previous.reward;profile.pendingBonus=previous.pending;
        if(target.id===currentSaveId)updateCity();updateDailyBonusUI();showToast('Не вдалося зберегти бонус. Перевір вільне місце у браузері.');return;
      }
      if(target.id===currentSaveId)updateCity();
    }else profile.pendingBonus=(Number(profile.pendingBonus)||0)+amount;
    if(!persistProfile()){
      profile.dailyClaimDay=previous.day;profile.dailyStreak=previous.streak;profile.dailyLastReward=previous.reward;profile.pendingBonus=previous.pending;
      if(target){target.cash=previousCash;saveData(target);if(target.id===currentSaveId)updateCity();}
      updateDailyBonusUI();showToast('Не вдалося зберегти бонус. Перевір вільне місце у браузері.');return;
    }
    updateDailyBonusUI();
    showToast(target?`Щоденний бонус ${money(amount)} додано до міста.`:`Бонус ${money(amount)} збережено для першого міста.`);
  }
  function fileToAvatar(file) {
    return new Promise((resolve,reject) => {
      const draw = (source,w,h,release=()=>{}) => {
        try {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
          const side = Math.min(w,h), context = canvas.getContext('2d');
          if(!context||!side)throw new Error('image canvas unavailable');
          context.drawImage(source,(w-side)/2,(h-side)/2,side,side,0,0,320,320);
          resolve(canvas.toDataURL('image/jpeg',.82));
        } catch(error) { reject(error); }
        finally { try{release();}catch{} }
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
  function itemById(id) { return CATALOG.find(item=>item.id===id); }
  function buildingIncome(building) { const item=itemById(building.type); return item ? item.income*(1+((building.level||1)-1)*.5) : 0; }
  function incomePerMinute(save) { return save.buildings.reduce((sum,building)=>sum+buildingIncome(building),0); }
  function accrueIncome(save,now=Date.now()) {
    if(!save)return 0;
    const elapsed=Math.max(0,Math.min(now-(Number(save.lastTick)||now),60*60*1000));
    let earned=0;
    if(elapsed>0)save.buildings.forEach(building=>{
      const buildingEarned=buildingIncome(building)*elapsed/60000;
      building.totalEarned=(Number(building.totalEarned)||0)+buildingEarned;
      earned+=buildingEarned;
    });
    if(earned>0)save.cash+=earned;
    save.lastTick=now;
    return earned;
  }
  function upgradeCost(building) { const item=itemById(building.type); return item ? Math.round(item.cost*(.45+((building.level||1)-1)*.25)) : 0; }
  function updateMapHint() {
    const hint=$('#map-hint'),float=$('#map-placement-hint');
    const active=!!pendingBuildId||movingBuildingIndex!==null;
    hint.textContent=pendingBuildId?'ТАПНИ ВІЛЬНЕ МІСЦЕ НА КАРТІ':movingBuildingIndex!==null?'ТАПНИ НОВЕ МІСЦЕ ДЛЯ БУДІВЛІ':'ТЯГНИ КАРТУ · КНОПКИ − / + ДЛЯ МАСШТАБУ';
    float.hidden=!active; float.textContent=pendingBuildId?'ОБЕРИ МІСЦЕ ДЛЯ БУДІВНИЦТВА':'ОБЕРИ НОВЕ МІСЦЕ';
    $('#map-placement-cancel').hidden=!active;
    $('#build-panel').hidden=!buildPanelOpen;$('#build-toggle').hidden=buildPanelOpen;
    $('#map-surface').classList.toggle('placing',active);
  }
  function closeBuildPanel() {
    buildPanelOpen=false;pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;updateCity();
  }
  function toggleBuildPanel() {
    if(buildPanelOpen){closeBuildPanel();return;}
    pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=true;updateCity();
  }
  function constrainMapOffsets() {
    const rect=$('#map-surface').getBoundingClientRect(),world=$('#map-world');
    const worldWidth=world.offsetWidth||rect.width,worldHeight=world.offsetHeight||rect.height;
    const maxX=Math.max(0,(worldWidth*mapZoom-rect.width)/2),maxY=Math.max(0,(worldHeight*mapZoom-rect.height)/2);
    mapOffsetX=Math.max(-maxX,Math.min(maxX,mapOffsetX));mapOffsetY=Math.max(-maxY,Math.min(maxY,mapOffsetY));
  }
  function updateMapTransform() {
    const world=$('#map-world');if(!world)return;
    constrainMapOffsets();world.style.transform=`translate3d(${mapOffsetX}px,${mapOffsetY}px,0) scale(${mapZoom})`;
    $('#map-zoom-label').textContent=`${Math.round(mapZoom*100)}%`;
    $('#map-zoom-out').disabled=mapZoom<=.7;
    $('#map-zoom-in').disabled=mapZoom>=2.8;
  }
  function setMapZoom(nextZoom,anchorX,anchorY) {
    const rect=$('#map-surface').getBoundingClientRect(),previousZoom=mapZoom;
    nextZoom=Math.max(.7,Math.min(2.8,Math.round(nextZoom*10)/10));
    if(nextZoom===previousZoom)return;
    const localX=(anchorX??(rect.left+rect.width/2))-rect.left-rect.width/2;
    const localY=(anchorY??(rect.top+rect.height/2))-rect.top-rect.height/2;
    mapOffsetX+=(localX-mapOffsetX)*(1-nextZoom/previousZoom);
    mapOffsetY+=(localY-mapOffsetY)*(1-nextZoom/previousZoom);
    mapZoom=nextZoom;updateMapTransform();
  }
  function startMapGesture(event) {
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(event.target.closest('.map-controls,.build-toggle,.map-placement-cancel,[data-building-index]'))return;
    const placeMode=!!pendingBuildId||movingBuildingIndex!==null;
    mapGesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:mapOffsetX,offsetY:mapOffsetY,dragged:false,placeMode};
    try{$('#map-surface').setPointerCapture(event.pointerId);}catch{}
  }
  function moveMapGesture(event) {
    if(!mapGesture||mapGesture.pointerId!==event.pointerId)return;
    const dx=event.clientX-mapGesture.startX,dy=event.clientY-mapGesture.startY;
    if(!mapGesture.dragged&&Math.hypot(dx,dy)>6){mapGesture.dragged=true;suppressMapClickUntil=Date.now()+180;}
    if(!mapGesture.dragged)return;
    event.preventDefault();
    if(mapGesture.placeMode)return;
    mapOffsetX=mapGesture.offsetX+dx;mapOffsetY=mapGesture.offsetY+dy;
    updateMapTransform();$('#map-surface').classList.add('is-panning');
  }
  function endMapGesture(event) {
    if(!mapGesture||mapGesture.pointerId!==event.pointerId)return;
    if(mapGesture.dragged)suppressMapClickUntil=Date.now()+180;
    mapGesture=null;$('#map-surface').classList.remove('is-panning');
    try{if($('#map-surface').hasPointerCapture(event.pointerId))$('#map-surface').releasePointerCapture(event.pointerId);}catch{}
  }
  function renderSelectionPanel(save) {
    const panel=$('#selection-panel'),list=$('#build-list'),heading=$('#build-action-title');
    if(selectedBuildingIndex!==null&&save.buildings[selectedBuildingIndex]){
      const building=save.buildings[selectedBuildingIndex],item=itemById(building.type),cost=upgradeCost(building),refund=Math.floor(building.invested*.2),income=buildingIncome(building),maxed=building.level>=5;
      heading.textContent='КЕРУВАННЯ'; list.hidden=true; panel.hidden=false;
      const actions=confirmingRemoval?`<div class="demolish-confirm"><p>Точно знести? Повернеться <b>${money(refund)}</b> — 20% вкладень.</p><div><button type="button" data-cancel-remove>ЗАЛИШИТИ</button><button type="button" data-confirm-remove>ТАК, ЗНЕСТИ</button></div></div>`:`<div class="selection-actions"><button type="button" class="upgrade-building" data-upgrade ${maxed||save.cash<cost?'disabled':''}><span>ПОКРАЩИТИ</span><small>${maxed?'МАКС. РІВЕНЬ':money(cost)}</small></button><button type="button" class="move-building" data-move-building>${movingBuildingIndex===selectedBuildingIndex?'СКАСУВАТИ ПЕРЕМІЩЕННЯ':'ПЕРЕМІСТИТИ'}</button><button type="button" class="remove-building" data-remove-building>ЗНЕСТИ <small>+${money(refund)}</small></button></div>`;
      panel.innerHTML=`<div class="selection-panel-head"><div class="selected-building"><span class="build-icon">${item?.icon||icon.warehouse}</span><span><b>${escapeHtml(item?.name||building.name||'Будівля')}</b><small>РІВЕНЬ ${building.level} · +${money(income)}/ХВ</small></span></div><button type="button" class="selection-close" data-clear-selection aria-label="Закрити керування будівлею" title="Закрити">×</button></div><div class="building-earned"><small>ЗАРОБИЛО ЗА ВЕСЬ ЧАС</small><b>${money(building.totalEarned||0)}</b></div><p class="selection-hint">${movingBuildingIndex===selectedBuildingIndex?'Тапни нове місце на карті, щоб переставити будівлю.':'Покращуй будівлю або перемісти її на вільне місце.'}</p>${actions}`;
      $('[data-clear-selection]',panel)?.addEventListener('click',()=>{selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=false;renderCity();});
      if(confirmingRemoval){
        $('[data-confirm-remove]',panel)?.addEventListener('click',removeSelected);
        $('[data-cancel-remove]',panel)?.addEventListener('click',()=>{confirmingRemoval=false;renderCity();});
      }else{
        $('[data-upgrade]',panel)?.addEventListener('click',upgradeSelected);
        $('[data-move-building]',panel)?.addEventListener('click',()=>{
          if(movingBuildingIndex===selectedBuildingIndex){movingBuildingIndex=null;updateMapHint();renderSelectionPanel(save);showToast('Переміщення скасовано.');return;}
          pendingBuildId=null;movingBuildingIndex=selectedBuildingIndex;buildPanelOpen=false;updateMapHint();renderCity();showToast('Тепер вибери вільне місце на карті.');
        });
        $('[data-remove-building]',panel)?.addEventListener('click',()=>{confirmingRemoval=true;renderCity();});
      }
    } else if(pendingBuildId){
      const item=itemById(pendingBuildId);heading.textContent='ОБЕРИ МІСЦЕ';list.hidden=false;panel.hidden=false;
      panel.innerHTML=`<p class="selection-hint selected-build-hint">${item?.name||'Будівля'} вибрана. Тапни вільне місце на карті, щоб побудувати за ${money(item?.cost||0)}.</p><button class="cancel-build" data-cancel-build>СКАСУВАТИ ВИБІР</button>`;
      $('[data-cancel-build]',panel).addEventListener('click',()=>{pendingBuildId=null;renderCity();});
    }else{heading.textContent='ЩО БУДУЄМО?';list.hidden=false;panel.hidden=true;panel.innerHTML='';}
    $('#build-filters').hidden=!!(selectedBuildingIndex!==null&&save.buildings[selectedBuildingIndex])||!!pendingBuildId;
  }
  function selectBuilding(index) {
    const save=getCurrent();
    if(!save||!Number.isInteger(index)||!save.buildings[index])return;
    selectedBuildingIndex=index;pendingBuildId=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=true;
    renderCity();
  }
  function updateCity() {
    const save=getCurrent(); if(!save)return; normalizeSave(save);
    $('#game-title').textContent=cityName(save).toLocaleUpperCase('uk');
    $('#city-heading').textContent=cityName(save).toLocaleUpperCase('uk');
    $('#city-cash').textContent=money(save.cash);$('#container-cash').textContent=money(save.cash);
    $('#city-income').textContent=money(incomePerMinute(save));$('#city-population').textContent=Number(save.population).toLocaleString('uk-UA');
    $('#building-count').textContent=`${save.buildings.length} / ${MAX_BUILDINGS}`;$('#build-panel-count').textContent=`${save.buildings.length}/${MAX_BUILDINGS}`;$('#cases-count').textContent=Number(save.casesOpened)||0;
    const mapLots=$('#map-lots');
    mapLots.innerHTML=save.buildings.map((building,index)=>{const item=itemById(building.type),level=building.level||1;return `<button type="button" class="city-lot occupied ${selectedBuildingIndex===index?'selected':''}" data-building-index="${index}" aria-pressed="${selectedBuildingIndex===index}" aria-label="${escapeHtml(item?.name||building.name||'Будівля')}, рівень ${level}. Торкніться для керування" style="--x:${building.x}%;--y:${building.y}%"><span class="lot-icon">${item?.icon||icon.warehouse}</span><b>${escapeHtml(item?.name||building.name||'Будівля')}</b><small>РІВ. ${level} · +${money(buildingIncome(building))}/ХВ</small></button>`;}).join('');
    $$('[data-building-index]',mapLots).forEach(marker=>{
      const openControls=event=>{event.preventDefault();event.stopPropagation();selectBuilding(Number(marker.dataset.buildingIndex));};
      marker.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;openControls(event);});
      marker.addEventListener('click',openControls);
    });
    const buildList=$('#build-list');
    buildList.innerHTML=CATALOG.map(item=>`<article class="build-card ${pendingBuildId===item.id?'selected':''}" title="${escapeHtml(item.desc)}" ${buildFilter!=='all'&&item.kind!==buildFilter?'hidden':''}><span class="build-icon">${item.icon}</span><span class="build-copy"><b>${escapeHtml(item.name)}</b><small>+${money(item.income)}/хв</small></span><button class="build-buy" data-select-build="${item.id}" ${save.cash<item.cost||save.buildings.length>=MAX_BUILDINGS?'disabled':''}>${money(item.cost)}</button></article>`).join('');
    $$('[data-select-build]',buildList).forEach(btn=>btn.addEventListener('click',()=>selectBuild(btn.dataset.selectBuild)));
    $$('.build-card',buildList).forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('[data-select-build]'))return;const button=$('[data-select-build]',card);if(button&&!button.disabled)selectBuild(button.dataset.selectBuild);}));
    renderSelectionPanel(save);updateMapHint();renderCaseBalance();updateMapTransform();
  }
  function renderCity() {
    updateCity();
  }
  function mapLotSize(surfaceWidth) {
    const mobile=window.matchMedia?window.matchMedia('(max-width: 680px)').matches:window.innerWidth<=680;
    return mobile?{width:84,height:64}:{width:Math.max(75,Math.min(112,surfaceWidth*.1)),height:Math.max(54,Math.min(78,surfaceWidth*.072))};
  }
  function canPlace(x,y,ignoreIndex=null){
    const save=getCurrent();if(!save)return false;
    const world=$('#map-world'),width=world.offsetWidth||$('#map-surface').clientWidth,height=world.offsetHeight||$('#map-surface').clientHeight,size=mapLotSize($('#map-surface').clientWidth);
    const minX=(size.width+12)/Math.max(1,width)*100,minY=(size.height+12)/Math.max(1,height)*100;
    return !save.buildings.some((building,index)=>index!==ignoreIndex&&Math.abs(building.x-x)<minX&&Math.abs(building.y-y)<minY);
  }
  function selectBuild(type){
    const save=getCurrent(),item=itemById(type);if(!save||!item)return;
    if(save.cash<item.cost){showToast('Не вистачає коштів для будівництва.');return;}
    if(save.buildings.length>=MAX_BUILDINGS){showToast('Місто вже повністю забудоване.');return;}
    pendingBuildId=type;selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=false;renderCity();
  }
  function positionFromEvent(event){
    const rect=$('#map-surface').getBoundingClientRect(),world=$('#map-world');
    const worldWidth=world.offsetWidth||rect.width,worldHeight=world.offsetHeight||rect.height;
    if(!rect.width||!rect.height||!worldWidth||!worldHeight)return{x:50,y:50};
    const localX=(event.clientX-rect.left-rect.width/2-mapOffsetX)/mapZoom+rect.width/2;
    const localY=(event.clientY-rect.top-rect.height/2-mapOffsetY)/mapZoom+rect.height/2;
    const worldX=(localX-(rect.width-worldWidth)/2)/worldWidth*100;
    const worldY=(localY-(rect.height-worldHeight)/2)/worldHeight*100;
    const size=mapLotSize(rect.width),xMargin=(size.width/2+6)/worldWidth*100,yMargin=(size.height/2+6)/worldHeight*100;
    return {x:Math.round(Math.min(100-xMargin,Math.max(xMargin,worldX))*10)/10,y:Math.round(Math.min(100-yMargin,Math.max(yMargin,worldY))*10)/10};
  }
  function placeOrMove(position){
    const save=getCurrent();if(!save)return;
    if(pendingBuildId){
      const item=itemById(pendingBuildId);if(!item)return;
      if(!canPlace(position.x,position.y)){showToast('Тут уже є будівля. Обери інше місце.');return;}
      accrueIncome(save);
      if(save.cash<item.cost){showToast('Не вистачає коштів.');pendingBuildId=null;buildPanelOpen=false;renderCity();return;}
      save.cash-=item.cost;save.buildings.push({type:item.id,name:item.name,x:position.x,y:position.y,level:1,invested:item.cost,totalEarned:0});
      if(item.population)save.population+=item.population;
      pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=false;saveData(save);updateCity();showToast(`${item.name} побудовано · +${money(item.income)}/хв.`);return;
    }
    if(movingBuildingIndex!==null){
      const index=movingBuildingIndex,building=save.buildings[index];if(!building)return;
      if(!canPlace(position.x,position.y,index)){showToast('Ця ділянка зайнята. Обери інше місце.');return;}
      building.x=position.x;building.y=position.y;movingBuildingIndex=null;selectedBuildingIndex=null;buildPanelOpen=false;confirmingRemoval=false;saveData(save);updateCity();showToast('Будівлю переміщено.');
    }
  }
  function upgradeSelected(){
    const save=getCurrent(),building=save?.buildings[selectedBuildingIndex],item=building&&itemById(building.type);if(!save||!building||!item)return;
    const price=upgradeCost(building);if(building.level>=5){showToast('Досягнуто максимального рівня.');return;}
    accrueIncome(save);if(save.cash<price){showToast('Не вистачає коштів на покращення.');return;}
    save.cash-=price;building.level++;building.invested+=price;if(item.population)save.population+=item.population;
    saveData(save);updateCity();showToast(`${item.name} покращено до рівня ${building.level}.`);
  }
  function removeSelected(){
    const save=getCurrent(),index=selectedBuildingIndex,building=save?.buildings[index],item=building&&itemById(building.type);if(!save||!building)return;
    accrueIncome(save);
    const refund=Math.floor((building.invested||0)*.2);save.cash+=refund;if(item?.population)save.population=Math.max(1200,save.population-item.population*(building.level||1));
    save.buildings.splice(index,1);selectedBuildingIndex=null;movingBuildingIndex=null;pendingBuildId=null;confirmingRemoval=false;buildPanelOpen=false;saveData(save);updateCity();showToast(`Будівлю знесено. Повернуто ${money(refund)} (20%).`);
  }
  function renderCaseBalance() { const save=getCurrent(); if(save) $('#container-cash').textContent=money(save.cash); }
  function recoverPendingCase(save) {
    if(!save.pendingCase)return null;
    const value=Number(save.pendingCase.reward?.value),price=Number(save.pendingCase.price),valid=Number.isFinite(value)&&value>=0;
    if(valid){save.cash+=value;save.casesOpened=(save.casesOpened||0)+1;}
    else save.cash+=Number.isFinite(price)&&price>=0?price:1000;
    save.pendingCase=null;
    return valid;
  }
  function launchGame(id) {
    const save=saves.find(item=>item.id===id); if(!save)return;
    normalizeSave(save);const recoveredCase=recoverPendingCase(save);currentSaveId=save.id;save.lastTick=Date.now();pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=false;
    switchGameTab('city');updateCity();openDialog('game-modal');
    if(recoveredCase!==null){saveData(save);showToast(recoveredCase?'Перерване відкриття кейса відновлено — нагороду збережено.':'Нагороду кейса не вдалося відновити. Кошти повернуто.');}
  }
  function switchGameTab(tab) {
    $$('.game-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.gameTab===tab));
    $$('.game-view').forEach(view=>{const selected=view.id===`${tab}-view`;view.hidden=!selected;view.classList.toggle('active',selected);});
    if(tab==='city') updateCity();
    if(tab==='containers') renderCaseBalance();
  }
  function closeGame() {
    const save=getCurrent(); if(save){accrueIncome(save);saveData(save);}
    if(dialogs['game-modal'].open) dialogs['game-modal'].close();
    currentSaveId=null; showToast('Місто збережено. До зустрічі!');
  }

  $$('[data-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.action;
    if(action==='new'){closeDialogs();$('#city-name').value='';openDialog('new-game-modal');setTimeout(()=>$('#city-name').focus(),80);}
    if(action==='profile')openProfileDialog(false);
    if(action==='settings')openDialog('settings-modal');
  }));
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    setActiveNav(button.dataset.view);
    if(button.dataset.view==='saves'){updateSaves();openDialog('saves-modal');}
    else {closeDialogs();window.scrollTo({top:0,behavior:'smooth'});}
  }));
  $$('[data-game-tab]').forEach(button=>button.addEventListener('click',()=>switchGameTab(button.dataset.gameTab)));
  const mapSurface=$('#map-surface');
  mapSurface.addEventListener('pointerdown',startMapGesture);
  mapSurface.addEventListener('pointermove',moveMapGesture);
  mapSurface.addEventListener('pointerup',endMapGesture);
  mapSurface.addEventListener('pointercancel',endMapGesture);
  mapSurface.addEventListener('wheel',event=>{event.preventDefault();setMapZoom(mapZoom+(event.deltaY<0?.1:-.1),event.clientX,event.clientY);},{passive:false});
  $('#map-zoom-in').addEventListener('click',()=>setMapZoom(mapZoom+.2));
  $('#map-zoom-out').addEventListener('click',()=>setMapZoom(mapZoom-.2));
  $('#map-zoom-reset').addEventListener('click',()=>{mapZoom=1;mapOffsetX=0;mapOffsetY=0;updateMapTransform();});
  window.addEventListener('resize',updateMapTransform);
  $('#build-toggle').addEventListener('click',toggleBuildPanel);
  $('#build-panel-close').addEventListener('click',closeBuildPanel);
  $$('[data-build-filter]').forEach(button=>button.addEventListener('click',()=>{
    buildFilter=button.dataset.buildFilter;
    $$('[data-build-filter]').forEach(filterButton=>filterButton.classList.toggle('active',filterButton===button));
    updateCity();
  }));
  $('#map-placement-cancel').addEventListener('click',()=>{pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=false;updateCity();});
  mapSurface.addEventListener('click',event=>{
    if(Date.now()<suppressMapClickUntil||event.target.closest('.map-controls,.build-toggle,.map-placement-cancel'))return;
    const marker=event.target.closest('[data-building-index]');
    if(marker){selectBuilding(Number(marker.dataset.buildingIndex));return;}
    if(pendingBuildId||movingBuildingIndex!==null){placeOrMove(positionFromEvent(event));return;}
    if(selectedBuildingIndex!==null){selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=false;renderCity();return;}
    if(buildPanelOpen){buildPanelOpen=false;renderCity();}
  });
  updateProfile(); updateSaves();
  $('#new-game-form').addEventListener('submit',event=>{
    event.preventDefault();const name=$('#city-name').value.trim();if(!name)return;
    const pendingBonus=Math.max(0,finiteNumber(profile.pendingBonus));let appliedBonus=0,bonusDeferred=false;
    if(pendingBonus){profile.pendingBonus=0;if(persistProfile())appliedBonus=pendingBonus;else{profile.pendingBonus=pendingBonus;bonusDeferred=true;}}
    const save={id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`,cityName:name,business:name,cash:70000+appliedBonus,population:1200,buildings:[],mapVersion:2,casesOpened:0,lastTick:Date.now(),date:new Date().toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'})};
    saves.unshift(save);currentSaveId=save.id;pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;confirmingRemoval=false;buildPanelOpen=false;mapZoom=1;mapOffsetX=0;mapOffsetY=0;
    const citySaved=saveData(save);
    if(appliedBonus&&!citySaved){profile.pendingBonus+=appliedBonus;persistProfile();save.cash-=appliedBonus;appliedBonus=0;bonusDeferred=true;}
    updateCity();switchGameTab('city');openDialog('game-modal');
    if(appliedBonus)showToast(`Щоденний бонус ${money(appliedBonus)} додано до нового міста.`);
    else if(bonusDeferred)showToast('Бонус залишився у профілі та буде доданий, коли сховище звільниться.');
  });
  $('#exit-game').addEventListener('click',closeGame);
  $('#game-profile-trigger').addEventListener('click',()=>openProfileDialog(true));
  $('#game-modal').addEventListener('cancel',event=>{event.preventDefault();if(!$('#case-overlay').hidden){if(caseCanClose)hideCaseOverlay();return;}closeGame();});
  $('#continue-button').addEventListener('click',()=>{if(saves[0])launchGame(saves[0].id);});
  function weightedReward(type){const items=REWARDS[type];let roll=Math.random()*items.reduce((s,x)=>s+x.weight,0);for(const item of items){roll-=item.weight;if(roll<=0)return item;}return items[0];}
  function renderCarDropItems(){
    const list=$('#car-drop-items');if(!list)return;
    list.innerHTML=REWARDS.cars.map(item=>`<div class="drop-item"><img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy"/><span>${escapeHtml(item.name)}<b>${Number(item.weight).toLocaleString('uk-UA',{maximumFractionDigits:1})}%</b></span><small>Ринкова ціна ${money(item.marketPrice)}</small></div>`).join('');
  }
  renderCarDropItems();
  async function startCase(type){

    if (!$('#case-overlay').hidden) return;
    const save=getCurrent();if(!save)return;
    clearTimeout(caseTimer);
    const price=CASE_PRICES[type]||1000;
    accrueIncome(save);
    if(save.cash<price){showToast('Не вистачає коштів на цей контейнер.');return;}
    const reward=weightedReward(type),src=type==='cars'?'public/container-cars.jpg':'public/container-arms.jpg';
    playNotificationSound();
    save.cash-=price;save.pendingCase={type,price,reward};saveData(save);updateCity();
    const track=$('#roulette-track'),winnerIndex=23;
    const spinMs=document.body.classList.contains('reduce-motion')?250:8800;
    const cards=Array.from({length:29},(_,i)=>i===winnerIndex?reward:weightedReward(type));
    track.innerHTML=cards.map((item,i)=>`<div class="roulette-item ${item.rarity}" data-index="${i}"><img src="${item.image||src}" alt="${escapeHtml(item.name)}"/><small>${item.rarity==='legendary'?'★ ЛЕГЕНДАРНЕ':item.rarity==='epic'?'◆ ЕПІЧНЕ':item.rarity==='rare'?'● РІДКІСНЕ':'ЗВИЧАЙНЕ'}</small><span>${escapeHtml(item.name)}</span></div>`).join('');
    $('#case-opening-title').textContent=type==='cars'?'АВТОМОБІЛЬНИЙ КОНТЕЙНЕР':'КОНТЕЙНЕР З АРСЕНАЛОМ';
    $('#case-opening-subtitle').textContent='Завантажуємо нагороди…';$('#case-result').hidden=true;$('#case-close').disabled=true;caseCanClose=false;
    const overlay=$('#case-overlay');overlay.hidden=false;track.style.transition='none';track.style.transform='translateX(0px)';
    await Promise.all([...track.querySelectorAll('img')].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});})));
    if(overlay.hidden)return;
    $('#case-opening-subtitle').textContent='Вантаж на шляху…';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const winner=track.querySelector(`[data-index="${winnerIndex}"]`),windowBox=$('.roulette-window');
      const offset=windowBox.clientWidth/2-(winner.offsetLeft+winner.offsetWidth/2);
      track.style.transition=`transform ${spinMs}ms cubic-bezier(.10,.72,.08,1)`;track.style.transform=`translateX(${offset}px)`;
    }));
    let settled=false;
    const finish=()=>{if(settled)return;settled=true;clearTimeout(caseTimer);accrueIncome(save);save.cash+=reward.value;save.pendingCase=null;save.casesOpened=(save.casesOpened||0)+1;saveData(save);updateCity();$('#case-opening-subtitle').textContent='Контейнер відкрито. Ось що тобі дісталось:';$('#result-name').textContent=reward.name.toLocaleUpperCase('uk');const marketPrice=$('#result-market-price');marketPrice.hidden=!reward.marketPrice;marketPrice.textContent=reward.marketPrice?`Ринкова ціна: ${money(reward.marketPrice)}`:'';$('#result-payout-label').textContent=type==='cars'?'ЗАРАХОВАНО ЗА РИНКОВОЮ ЦІНОЮ':'ГРОШОВА ВИПЛАТА';$('#result-value').textContent=`+${money(reward.value)}`;$('#case-result').hidden=false;$('#case-close').disabled=false;caseCanClose=true;playNotificationSound();};
    track.addEventListener('transitionend',finish,{once:true});caseTimer=setTimeout(finish,spinMs+500);
  }
  $$('[data-open-case]').forEach(button=>button.addEventListener('click',()=>startCase(button.dataset.openCase)));
  function hideCaseOverlay(){clearTimeout(caseTimer);$('#case-overlay').hidden=true;$('#roulette-track').style.transition='none';$('#roulette-track').style.transform='translateX(0)';caseCanClose=false;}
  $('#case-close').addEventListener('click',()=>{if(caseCanClose)hideCaseOverlay();});
  $('#collect-result').addEventListener('click',hideCaseOverlay);

  $('#avatar-pick').addEventListener('click',()=>$('#avatar-input').click());
  $('#avatar-input').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){showToast('Обери файл зображення.');return;}if(file.size>20*1024*1024){showToast('Фото завелике. Максимум — 20 МБ.');return;}try{pendingAvatar=await fileToAvatar(file);renderAvatar($('#avatar-preview'),pendingAvatar);}catch{showToast('Не вдалося завантажити це фото. Спробуй інше.');}});
  $('#avatar-remove').addEventListener('click',()=>{pendingAvatar='';$('#avatar-input').value='';renderAvatar($('#avatar-preview'),'');});
  $('#profile-form').addEventListener('submit',event=>{
    event.preventDefault();const firstName=$('#player-first-name').value.trim(),lastName=$('#player-last-name').value.trim();if(!firstName||!lastName)return;
    profile.firstName=firstName;profile.lastName=lastName;profile.name=`${firstName} ${lastName}`;profile.avatar=pendingAvatar;
    if(!persistProfile()){showToast('Не вдалося зберегти профіль. Перевір вільне місце у браузері.');return;}
    updateProfile();$('#profile-modal').close();showToast('Профіль оновлено.');
  });
  $('#daily-bonus-claim').addEventListener('click',claimDailyBonus);
  ['sound','motion','hints'].forEach(key=>{const input=$(`#${key}-toggle`);input.checked=settings[key]!==false;input.addEventListener('change',()=>{settings[key]=input.checked;try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{showToast('Не вдалося зберегти налаштування.');}applySettings();});});
  applySettings();
  $('#settings-done').addEventListener('click',()=>{closeDialogs();showToast('Налаштування збережено.');});

  setInterval(()=>{
    const save=getCurrent();if(!save||!dialogs['game-modal'].open)return;
    const income=incomePerMinute(save);accrueIncome(save);try{localStorage.setItem(SAVE_KEY,JSON.stringify(saves));}catch{}
    $('#city-cash').textContent=money(save.cash);$('#container-cash').textContent=money(save.cash);$('#city-income').textContent=money(income);
    $$('[data-select-build]').forEach(btn=>{const item=itemById(btn.dataset.selectBuild);btn.disabled=!item||save.cash<item.cost||save.buildings.length>=MAX_BUILDINGS;});
    const selected=save.buildings[selectedBuildingIndex],earnedDisplay=$('.building-earned b');
    if(selected&&earnedDisplay)earnedDisplay.textContent=money(selected.totalEarned||0);
  },5000);
  window.addEventListener('pagehide',()=>{
    const save=getCurrent();if(!save||!dialogs['game-modal'].open)return;
    accrueIncome(save);try{localStorage.setItem(SAVE_KEY,JSON.stringify(saves));}catch{}
  });
})();
