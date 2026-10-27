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
  let pendingBuildId = null;
  let selectedBuildingIndex = null;
  let movingBuildingIndex = null;
  const MAX_BUILDINGS = 24;

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
  const REWARDS = {
    cars:[
      {name:'Hyundai Elantra',value:250,rarity:'common',weight:28,image:'public/loot-hyundai-elantra.jpg'},
      {name:'Volkswagen Golf GTI',value:450,rarity:'common',weight:22,image:'public/loot-vw-golf.jpg'},
      {name:'Mercedes-AMG C 63',value:850,rarity:'common',weight:15,image:'public/loot-mercedes-amg-c63.jpg'},
      {name:'Audi RS6 Avant',value:1100,rarity:'common',weight:13,image:'public/loot-audi-rs6.jpg'},
      {name:'BMW M3',value:1700,rarity:'rare',weight:12,image:'public/loot-bmw-m3.jpg'},
      {name:'Porsche 911 GT3 RS',value:6500,rarity:'epic',weight:6,image:'public/loot-porsche-911.jpg'},
      {name:'Ferrari SF90 Stradale',value:18000,rarity:'epic',weight:3,image:'public/loot-ferrari-sf90.jpg'},
      {name:'Bugatti Chiron',value:45000,rarity:'legendary',weight:1,image:'public/loot-bugatti-chiron.jpg'}
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
    save.cash = Number.isFinite(Number(save.cash)) ? Number(save.cash) : 70000;
    if (!Array.isArray(save.buildings)) save.buildings = [];
    save.population = Number.isFinite(Number(save.population)) ? Number(save.population) : 1200;
    save.casesOpened = Number.isFinite(Number(save.casesOpened)) ? Number(save.casesOpened) : 0;
    save.lastTick = Number.isFinite(Number(save.lastTick)) ? Number(save.lastTick) : Date.now();
    save.buildings.forEach((building,index) => {
      const item = CATALOG.find(entry => entry.id === building.type);
      const fallback = {x:12+(index%6)*15.2,y:18+Math.floor(index/6)*21};
      if (!Number.isFinite(Number(building.x))) building.x = fallback.x;
      if (!Number.isFinite(Number(building.y))) building.y = fallback.y;
      building.level = Math.max(1,Number(building.level)||1);
      building.invested = Math.max(0,Number(building.invested)||item?.cost||0);
    });
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
  function itemById(id) { return CATALOG.find(item=>item.id===id); }
  function buildingIncome(building) { const item=itemById(building.type); return item ? item.income*(1+((building.level||1)-1)*.5) : 0; }
  function incomePerMinute(save) { return save.buildings.reduce((sum,building)=>sum+buildingIncome(building),0); }
  function upgradeCost(building) { const item=itemById(building.type); return item ? Math.round(item.cost*(.45+((building.level||1)-1)*.25)) : 0; }
  function updateMapHint() {
    const hint=$('#map-hint'),float=$('#map-placement-hint');
    const active=!!pendingBuildId||movingBuildingIndex!==null;
    hint.textContent=pendingBuildId?'ТАПНИ ВІЛЬНЕ МІСЦЕ НА КАРТІ':movingBuildingIndex!==null?'ТАПНИ НОВЕ МІСЦЕ ДЛЯ БУДІВЛІ':'ОБИРАЙ БУДІВЛІ ПРАВОРУЧ';
    float.hidden=!active; float.textContent=pendingBuildId?'ОБЕРИ МІСЦЕ ДЛЯ БУДІВНИЦТВА':'ОБЕРИ НОВЕ МІСЦЕ';
    $('#map-surface').classList.toggle('placing',active);
  }
  function renderSelectionPanel(save) {
    const panel=$('#selection-panel'),list=$('#build-list'),heading=$('#build-action-title');
    if(selectedBuildingIndex!==null&&save.buildings[selectedBuildingIndex]){
      const building=save.buildings[selectedBuildingIndex],item=itemById(building.type),cost=upgradeCost(building),refund=Math.floor(building.invested*.2),income=buildingIncome(building),maxed=building.level>=5;
      heading.textContent='КЕРУВАННЯ'; list.hidden=true; panel.hidden=false;
      panel.innerHTML=`<div class="selected-building"><span class="build-icon">${item?.icon||icon.warehouse}</span><span><b>${escapeHtml(item?.name||building.name||'Будівля')}</b><small>РІВЕНЬ ${building.level} · +${money(income)}/ХВ</small></span></div><p class="selection-hint">${movingBuildingIndex===selectedBuildingIndex?'Тапни нове місце на карті, щоб переставити будівлю.':'Покращуй будівлю або перемісти її на вільне місце.'}</p><div class="selection-actions"><button class="upgrade-building" data-upgrade ${maxed||save.cash<cost?'disabled':''}><span>ПОКРАЩИТИ</span><small>${maxed?'МАКС. РІВЕНЬ':money(cost)}</small></button><button class="move-building" data-move-building>ПЕРЕМІСТИТИ</button><button class="remove-building" data-remove-building>ЗНЕСТИ <small>+${money(refund)}</small></button><button class="clear-selection" data-clear-selection aria-label="Закрити">×</button></div>`;
      $('[data-upgrade]',panel)?.addEventListener('click',upgradeSelected);
      $('[data-move-building]',panel)?.addEventListener('click',()=>{pendingBuildId=null;movingBuildingIndex=selectedBuildingIndex;updateMapHint();renderSelectionPanel(save);showToast('Тепер вибери вільне місце на карті.');});
      $('[data-remove-building]',panel)?.addEventListener('click',removeSelected);
      $('[data-clear-selection]',panel)?.addEventListener('click',()=>{selectedBuildingIndex=null;movingBuildingIndex=null;renderCity();});
    } else if(pendingBuildId){
      const item=itemById(pendingBuildId);heading.textContent='ОБЕРИ МІСЦЕ';list.hidden=false;panel.hidden=false;
      panel.innerHTML=`<p class="selection-hint selected-build-hint">${item?.name||'Будівля'} вибрана. Тапни вільне місце на карті, щоб побудувати за ${money(item?.cost||0)}.</p><button class="cancel-build" data-cancel-build>СКАСУВАТИ ВИБІР</button>`;
      $('[data-cancel-build]',panel).addEventListener('click',()=>{pendingBuildId=null;renderCity();});
    }else{heading.textContent='ЩО БУДУЄМО?';list.hidden=false;panel.hidden=true;panel.innerHTML='';}
  }
  function updateCity() {
    const save=getCurrent(); if(!save)return; normalizeSave(save);
    $('#game-title').textContent=cityName(save).toLocaleUpperCase('uk');
    $('#city-heading').textContent=cityName(save).toLocaleUpperCase('uk');
    $('#city-cash').textContent=money(save.cash);$('#container-cash').textContent=money(save.cash);
    $('#city-income').textContent=money(incomePerMinute(save));$('#city-population').textContent=Number(save.population).toLocaleString('uk-UA');
    $('#building-count').textContent=`${save.buildings.length} / ${MAX_BUILDINGS}`;$('#build-panel-count').textContent=`${save.buildings.length}/${MAX_BUILDINGS}`;$('#cases-count').textContent=Number(save.casesOpened)||0;
    $('#map-lots').innerHTML=save.buildings.map((building,index)=>{const item=itemById(building.type),level=building.level||1;return `<button class="city-lot occupied ${selectedBuildingIndex===index?'selected':''}" data-building-index="${index}" aria-label="${escapeHtml(item?.name||building.name||'Будівля')}, рівень ${level}" style="--x:${building.x}%;--y:${building.y}%"><span class="lot-icon">${item?.icon||icon.warehouse}</span><b>${escapeHtml(item?.name||building.name||'Будівля')}</b><small>РІВ. ${level} · +${money(buildingIncome(building))}/ХВ</small></button>`;}).join('');
    const buildList=$('#build-list');
    buildList.innerHTML=CATALOG.map(item=>`<article class="build-card ${pendingBuildId===item.id?'selected':''}"><span class="build-icon">${item.icon}</span><span class="build-copy"><b>${item.name}</b><small>+${money(item.income)}/хв</small></span><button class="build-buy" data-select-build="${item.id}" ${save.cash<item.cost||save.buildings.length>=MAX_BUILDINGS?'disabled':''}>${money(item.cost)}</button></article>`).join('');
    $$('[data-select-build]',buildList).forEach(btn=>btn.addEventListener('click',()=>selectBuild(btn.dataset.selectBuild)));
    $$('.build-card',buildList).forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('[data-select-build]'))return;const button=$('[data-select-build]',card);if(button&&!button.disabled)selectBuild(button.dataset.selectBuild);}));
    renderSelectionPanel(save);updateMapHint();renderCaseBalance();
  }
  function canPlace(x,y,ignoreIndex=null){
    const save=getCurrent();if(!save)return false;
    return !save.buildings.some((building,index)=>index!==ignoreIndex&&Math.abs(building.x-x)<14&&Math.abs(building.y-y)<14);
  }
  function selectBuild(type){
    const save=getCurrent(),item=itemById(type);if(!save||!item)return;
    if(save.cash<item.cost){showToast('Не вистачає коштів для будівництва.');return;}
    if(save.buildings.length>=MAX_BUILDINGS){showToast('Місто вже повністю забудоване.');return;}
    pendingBuildId=type;selectedBuildingIndex=null;movingBuildingIndex=null;renderCity();
    if(matchMedia('(max-width: 680px)').matches)$('#map-panel').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function positionFromEvent(event){
    const rect=$('#map-surface').getBoundingClientRect();
    const xMargin=Math.min(15,Math.max(8,60/rect.width*100)),yMargin=Math.min(18,Math.max(9,34/rect.height*100));
    return {x:Math.round(Math.min(100-xMargin,Math.max(xMargin,(event.clientX-rect.left)/rect.width*100))*10)/10,y:Math.round(Math.min(100-yMargin,Math.max(yMargin,(event.clientY-rect.top)/rect.height*100))*10)/10};
  }
  function placeOrMove(position){
    const save=getCurrent();if(!save)return;
    if(pendingBuildId){
      const item=itemById(pendingBuildId);if(!item)return;
      if(!canPlace(position.x,position.y)){showToast('Тут уже є будівля. Обери інше місце.');return;}
      if(save.cash<item.cost){showToast('Не вистачає коштів.');pendingBuildId=null;renderCity();return;}
      save.cash-=item.cost;save.buildings.push({type:item.id,name:item.name,x:position.x,y:position.y,level:1,invested:item.cost});
      if(item.population)save.population+=item.population;
      pendingBuildId=null;selectedBuildingIndex=save.buildings.length-1;movingBuildingIndex=null;saveData(save);updateCity();showToast(`${item.name} побудовано · +${money(item.income)}/хв.`);return;
    }
    if(movingBuildingIndex!==null){
      const index=movingBuildingIndex,building=save.buildings[index];if(!building)return;
      if(!canPlace(position.x,position.y,index)){showToast('Ця ділянка зайнята. Обери інше місце.');return;}
      building.x=position.x;building.y=position.y;movingBuildingIndex=null;saveData(save);updateCity();showToast('Будівлю переміщено.');
    }
  }
  function upgradeSelected(){
    const save=getCurrent(),building=save?.buildings[selectedBuildingIndex],item=building&&itemById(building.type);if(!save||!building||!item)return;
    const price=upgradeCost(building);if(building.level>=5){showToast('Досягнуто максимального рівня.');return;}if(save.cash<price){showToast('Не вистачає коштів на покращення.');return;}
    save.cash-=price;building.level++;building.invested+=price;if(item.population)save.population+=item.population;
    saveData(save);updateCity();showToast(`${item.name} покращено до рівня ${building.level}.`);
  }
  function removeSelected(){
    const save=getCurrent(),index=selectedBuildingIndex,building=save?.buildings[index],item=building&&itemById(building.type);if(!save||!building)return;
    const refund=Math.floor((building.invested||0)*.2);save.cash+=refund;if(item?.population)save.population=Math.max(1200,save.population-item.population*(building.level||1));
    save.buildings.splice(index,1);selectedBuildingIndex=null;movingBuildingIndex=null;pendingBuildId=null;saveData(save);updateCity();showToast(`Будівлю знесено. Повернуто ${money(refund)} (20%).`);
  }
  function renderCaseBalance() { const save=getCurrent(); if(save) $('#container-cash').textContent=money(save.cash); }
  function launchGame(id) {
    const save=saves.find(item=>item.id===id); if(!save)return;
    normalizeSave(save); currentSaveId=save.id; save.lastTick=Date.now();pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;
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
  $('#map-surface').addEventListener('click',event=>{
    const marker=event.target.closest('[data-building-index]');
    if(marker){selectedBuildingIndex=Number(marker.dataset.buildingIndex);pendingBuildId=null;movingBuildingIndex=null;renderCity();return;}
    if(pendingBuildId||movingBuildingIndex!==null)placeOrMove(positionFromEvent(event));
  });
  updateProfile(); updateSaves();
  $('#new-game-form').addEventListener('submit',event=>{
    event.preventDefault();const name=$('#city-name').value.trim();if(!name)return;
    const save={id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`,cityName:name,business:name,cash:70000,population:1200,buildings:[],casesOpened:0,lastTick:Date.now(),date:new Date().toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'})};
    saves.unshift(save);currentSaveId=save.id;pendingBuildId=null;selectedBuildingIndex=null;movingBuildingIndex=null;saveData(save);updateCity();switchGameTab('city');openDialog('game-modal');
  });
  $('#exit-game').addEventListener('click',closeGame);
  $('#game-modal').addEventListener('cancel',event=>{event.preventDefault();if(!$('#case-overlay').hidden){if(caseCanClose)hideCaseOverlay();return;}closeGame();});
  $('#continue-button').addEventListener('click',()=>{if(saves[0])launchGame(saves[0].id);});
  function weightedReward(type){const items=REWARDS[type];let roll=Math.random()*items.reduce((s,x)=>s+x.weight,0);for(const item of items){roll-=item.weight;if(roll<=0)return item;}return items[0];}
  function startCase(type){
    const save=getCurrent();if(!save)return;
    const price=1000;
    if(save.cash<price){showToast('Не вистачає коштів на цей контейнер.');return;}
    save.cash-=price;save.lastTick=Date.now();saveData(save);updateCity();
    const reward=weightedReward(type),src=type==='cars'?'public/container-cars.jpg':'public/container-arms.jpg';
    const track=$('#roulette-track'),winnerIndex=23;
    const spinMs=document.body.classList.contains('reduce-motion')?250:8800;
    const cards=Array.from({length:29},(_,i)=>i===winnerIndex?reward:weightedReward(type));
    track.innerHTML=cards.map((item,i)=>`<div class="roulette-item ${item.rarity}" data-index="${i}"><img src="${item.image||src}" alt="${escapeHtml(item.name)}" loading="lazy"/><small>${item.rarity==='legendary'?'★ ЛЕГЕНДАРНЕ':item.rarity==='epic'?'◆ ЕПІЧНЕ':item.rarity==='rare'?'● РІДКІСНЕ':'ЗВИЧАЙНЕ'}</small><span>${escapeHtml(item.name)}</span></div>`).join('');
    $('#case-opening-title').textContent=type==='cars'?'АВТОМОБІЛЬНИЙ КОНТЕЙНЕР':'КОНТЕЙНЕР З АРСЕНАЛОМ';
    $('#case-opening-subtitle').textContent='Вантаж на шляху…';$('#case-result').hidden=true;$('#case-close').disabled=true;caseCanClose=false;
    const overlay=$('#case-overlay');overlay.hidden=false;track.style.transition='none';track.style.transform='translateX(0px)';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const winner=track.querySelector(`[data-index="${winnerIndex}"]`),windowBox=$('.roulette-window');
      const offset=windowBox.clientWidth/2-(winner.offsetLeft+winner.offsetWidth/2);
      track.style.transition=`transform ${spinMs}ms cubic-bezier(.10,.72,.08,1)`;track.style.transform=`translateX(${offset}px)`;
    }));
    let settled=false;
    const finish=()=>{if(settled)return;settled=true;clearTimeout(caseTimer);save.cash+=reward.value;save.casesOpened=(save.casesOpened||0)+1;save.lastTick=Date.now();saveData(save);updateCity();$('#case-opening-subtitle').textContent='Контейнер відкрито. Ось що тобі дісталось:';$('#result-name').textContent=reward.name.toLocaleUpperCase('uk');$('#result-value').textContent=`+${money(reward.value)}`;$('#case-result').hidden=false;$('#case-close').disabled=false;caseCanClose=true;};
    track.addEventListener('transitionend',finish,{once:true});caseTimer=setTimeout(finish,spinMs+500);
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
    $$('[data-select-build]').forEach(btn=>{const item=itemById(btn.dataset.selectBuild);btn.disabled=!item||save.cash<item.cost||save.buildings.length>=MAX_BUILDINGS;});
  },5000);
})();
