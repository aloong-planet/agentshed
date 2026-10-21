// Display mock only. The existing page fixtures and interactions are left intact.
// The scanning and the failure copy, in Chinese and English, are the prototypes' own.
//
// The startup states, as the app has them: before this launch's first snapshot the page is its startup
// skeleton; once data is there (restored from the last run), the title row's hint reads scanning, then
// disappears when the scan is done, or reads waiting-for-an-update when it failed. A page that also draws
// its skeleton opts in with StartupStatus.withSkeleton(fn) before building its demo bar: the switch then
// starts with a skeleton option, and fn(state) runs on every change ('skeleton' | 'restored' | 'fresh' |
// 'failed') so the page can swap its content for the skeleton and back.
//   .startup-hint            every one on the page shows the current state (the skeleton has its own)
//   [data-startup-scanning]  always reads the scanning copy (a skeleton's centred hint)
window.StartupStatus=(() => {
  const scanning={zh:'正在扫描各 agent 侧…',en:'Scanning the agent sides…'};
  const failed={zh:'显示上次的数据，等待更新',en:'Showing previous data, waiting for an update'};
  let state='restored',language='zh',skeleton=false;
  const listeners=[];
  // The demo bar's startup group, in the dock script's markup; the page's dh-note says where the states
  // come from in the app
  function controls(){
    const states=[...(skeleton?[['skeleton','骨架']]:[]),['restored','扫描中'],['fresh','完成'],['failed','失败']];
    return `<div class="dh-group"><span class="dh-title">${skeleton?'启动':'启动恢复'}</span><div class="dh-opts">`+
      states.map(([value,label])=>
        `<button type="button" class="dh-opt" data-startup-state="${value}" aria-pressed="${state===value}">${label}</button>`).join('')+
      `</div></div>`;
  }
  function update(){
    document.querySelectorAll('.startup-hint').forEach(hint=>{
      hint.dataset.state=state;
      hint.querySelector('[data-startup-label]').textContent=(state==='failed'?failed:scanning)[language];
      hint.title=hint.textContent;
    });
    document.querySelectorAll('[data-startup-scanning]').forEach(el=>el.textContent=scanning[language]);
    document.querySelectorAll('[data-startup-state]').forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.startupState===state)));
  }
  document.addEventListener('DOMContentLoaded',()=>{
    // The placeholder is replaced, so the group is a direct child of the demo bar
    document.querySelectorAll('[data-startup-controls]').forEach(el=>el.outerHTML=controls());
    // The copy follows the language set on the settings prototype on pages that follow the language
    // (demo-dimensions.js); on any other page it stays in the source language.
    if(window.DemoDimensions) DemoDimensions.on('language',value=>{language=value;update()});
    else update();
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-startup-state]');
    if(button){state=button.dataset.startupState;update();listeners.forEach(fn=>fn(state))}
  });
  function withSkeleton(fn){
    skeleton=true;
    listeners.push(fn);
    fn(state);
  }
  return {controls,withSkeleton};
})();
