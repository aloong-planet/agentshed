// Display mock only. The existing page fixtures and interactions are left intact.
// Scan copy mirrors the six app dictionaries; failure copy was confirmed with the original prototypes.
window.StartupStatus=(() => {
  const scanning={zh:'正在扫描各 agent 侧…',en:'Scanning the agent sides…',
    fr:'Analyse des côtés agents…',es:'Escaneando los lados de agente…',
    ru:'Сканирование сторон агентов…',ja:'各エージェントサイドをスキャン中…'};
  const failed={zh:'显示上次的数据，等待更新',en:'Showing previous data, waiting for an update',
    fr:'Données précédentes affichées, en attente de mise à jour',
    es:'Se muestran los datos anteriores, a la espera de una actualización',
    ru:'Показаны предыдущие данные, ожидается обновление',ja:'前回のデータを表示中、更新を待っています'};
  let state='restored',language='zh';
  function controls(){
    return `<span class="startup-demo" title="演示·已有数据来自上次成功读取；真实状态由扫描结果决定，应用内没有这些开关。此处只演示呈现，不读写缓存。"><span>演示·启动恢复</span>`+
      [['restored','扫描中'],['fresh','完成'],['failed','失败']].map(([value,label])=>
        `<button type="button" data-startup-state="${value}" aria-pressed="${state===value}">${label}</button>`).join('')+
      `<select data-startup-language aria-label="演示·状态文案语言">`+
      Object.keys(scanning).map(value=>`<option value="${value}" ${value===language?'selected':''}>${value.toUpperCase()}</option>`).join('')+
      `</select></span>`;
  }
  function update(){
    const hint=document.querySelector('.startup-hint');
    hint.dataset.state=state;
    hint.querySelector('[data-startup-label]').textContent=(state==='failed'?failed:scanning)[language];
    hint.title=hint.textContent;
    document.querySelectorAll('[data-startup-state]').forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.startupState===state)));
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-startup-controls]').forEach(el=>el.innerHTML=controls());
    update();
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-startup-state]');
    if(button){state=button.dataset.startupState;update()}
  });
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-startup-language]')){language=event.target.value;update()}
  });
  return {controls};
})();
