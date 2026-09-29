// As notificações só são inscritas após autenticação no ADM.
(function(){
  const button=document.getElementById('branded-push-enable');
  const status=document.getElementById('branded-push-status');
  let oneSignal=null,initPromise=null;
  function say(message){status.textContent=message;}
  function isIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent);}
  function isInstalled(){return window.navigator.standalone===true || window.matchMedia('(display-mode: standalone)').matches;}
  function loadSdk(){
    if(window.OneSignalDeferred)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      window.OneSignalDeferred=[];
      const script=document.createElement('script');
      script.src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o serviço de notificações.'));
      document.head.appendChild(script);
    });
  }
  async function ready(){
    if(initPromise)return initPromise;
    initPromise=(async()=>{
      const config=await apiGet('getBrandedPushConfig',{token:TOKEN});
      if(!config.appId)throw new Error('O app de notificações ainda não foi conectado.');
      await loadSdk();
      return new Promise((resolve,reject)=>{
        window.OneSignalDeferred=window.OneSignalDeferred||[];
        window.OneSignalDeferred.push(async OneSignal=>{
          try{
            const workerPath=new URL('./push/onesignal/OneSignalSDKWorker.js',location.href).pathname;
            const workerScope=new URL('./push/onesignal/',location.href).pathname;
            await OneSignal.init({appId:config.appId,serviceWorkerPath:workerPath,
              serviceWorkerParam:{scope:workerScope},autoPrompt:false});
            oneSignal=OneSignal;resolve(OneSignal);
          }catch(e){reject(e);}
        });
      });
    })();
    try{return await initPromise;}catch(e){initPromise=null;throw e;}
  }
  async function post(action,subscriptionId,token){
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,subscriptionId,token})});
    const data=await res.json();if(data.error)throw new Error(data.error);return data;
  }
  async function registerExisting(){
    if(!TOKEN)return;
    const sdk=await ready();
    const id=sdk.User.PushSubscription.id;
    if(id && sdk.User.PushSubscription.optedIn){await post('registerBrandedPush',id,TOKEN);say('Notificações da Vinii Imports ativadas neste aparelho.');}
    else say('Toque no botão para ativar os avisos neste aparelho.');
  }
  button.addEventListener('click',async()=>{
    if(!TOKEN){say('Entre no ADM primeiro.');return;}
    if(isIOS()&&!isInstalled()){
      say('No iPhone: abra este ADM no Safari, toque em Compartilhar → Adicionar à Tela de Início. Abra o ícone Vinii ADM e toque novamente aqui.');return;
    }
    button.disabled=true;say('Ativando notificações…');
    try{
      const sdk=await ready();
      await sdk.Notifications.requestPermission();
      if(!sdk.Notifications.permission)throw new Error('Permissão de notificações não concedida.');
      await sdk.User.PushSubscription.optIn();
      let id=sdk.User.PushSubscription.id;
      if(!id){
        id=await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Inscrição ainda não disponível. Tente novamente.')),12000);
          sdk.User.PushSubscription.addEventListener('change',function onChange(event){
            if(event.current.id){clearTimeout(timer);sdk.User.PushSubscription.removeEventListener('change',onChange);resolve(event.current.id);}
          });
        });
      }
      await post('registerBrandedPush',id,TOKEN);
      say('Notificações da Vinii Imports ativadas neste aparelho.');
    }catch(e){say(e.message||'Não foi possível ativar. Tente novamente.');}
    finally{button.disabled=false;}
  });
  window.removeBrandedPush=async function(token){
    if(!oneSignal)return;
    const id=oneSignal.User.PushSubscription.id;
    try { if(id) await post('unregisterBrandedPush',id,token); }
    finally { await oneSignal.User.PushSubscription.optOut(); }
    say('Notificações desativadas neste aparelho.');
  };
  window.addEventListener('vinii-admin-login',()=>registerExisting().catch(e=>say(e.message||'Serviço indisponível.')));
})();
