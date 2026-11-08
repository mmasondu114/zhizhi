const {app,BrowserWindow,Menu,dialog,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {spawn}=require('node:child_process');
const smoke=process.argv.includes('--smoke-test');
const port=Number(process.env.PORT||4317),origin=`http://127.0.0.1:${port}`;
const appId='io.github.mmasondu114.zhizhi';
const root=app.isPackaged?path.join(process.resourcesPath,'backend'):path.resolve(__dirname,'..');
const dataRoot=process.env.TREE_DATA_DIR||(process.platform==='darwin'?path.join(app.getPath('appData'),'Zhizhi'):path.join(process.env.LOCALAPPDATA,'Zhizhi','data'));
app.setPath('userData',path.join(dataRoot,'desktop-profile'));
app.setAppUserModelId(appId);
let child,window,quitting=false,log,recoveries=0;
function diagnostic(event,detail={}){require('node:fs').mkdirSync(dataRoot,{recursive:true});require('node:fs').appendFile(path.join(dataRoot,'desktop.log'),JSON.stringify({at:new Date().toISOString(),event,...detail})+'\n',()=>{});}
process.on('uncaughtExceptionMonitor',error=>diagnostic('main-exception',{message:error.message,stack:error.stack}));
app.on('child-process-gone',(_event,details)=>diagnostic('child-process-gone',details));
const externalAllowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='github.com'&&u.pathname.startsWith('/mmasondu114/zhizhi/releases');}catch{return false;}};
async function openRelease(url){if(externalAllowed(url)&&!smoke)await shell.openExternal(url);}
async function health(){try{return await fetch(origin+'/api/health',{signal:AbortSignal.timeout(500)}).then(r=>r.ok?r.json():null);}catch{return null;}}
async function startBackend(){
 const existing=await health();if(existing){if(existing.appId===appId&&existing.version===app.getVersion())return;throw new Error('旧版知枝仍在运行，请先退出旧版，再打开新应用。');}
 await fs.mkdir(dataRoot,{recursive:true});
 const runtime=app.isPackaged?path.join(process.resourcesPath,'runtime',process.platform==='win32'?'node.exe':'bin/node'):process.env.TREE_NODE_PATH;
 if(!runtime)throw new Error('源码模式需要设置 TREE_NODE_PATH 为 Node.js 可执行文件');
 log=require('node:fs').createWriteStream(path.join(dataRoot,'server.log'),{flags:'a',mode:0o600});
 child=spawn(runtime,[path.join(root,'server','index.js')],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(port),TREE_DATA_DIR:dataRoot,...(app.isPackaged?{TREE_KEYCHAIN_HELPER:path.join(process.resourcesPath,'zhizhi-keychain')}:{})},stdio:['ignore','pipe','pipe','ipc']});
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.on('exit',(code,signal)=>diagnostic('backend-exit',{code,signal,quitting}));
 let failure;child.once('error',e=>failure=e);
 for(let i=0;i<80;i++){if(failure)throw failure;if(child.exitCode!==null)break;const h=await health();if(h?.appId===appId&&h.version===app.getVersion())return;await new Promise(r=>setTimeout(r,150));}
 throw new Error('本地服务未能启动，请查看应用数据目录中的 server.log。');
}
async function stopBackend(){
 if(child&&child.exitCode===null){const done=new Promise(r=>child.once('close',r));if(child.connected)child.send({type:'shutdown'});else child.kill();let timer;await Promise.race([done,new Promise(r=>timer=setTimeout(r,2500))]);clearTimeout(timer);if(child.exitCode===null){if(process.platform==='win32')await new Promise(r=>{const p=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});p.once('error',r);p.once('close',r);});else child.kill('SIGKILL');}}
 log?.end();
}
async function createWindow(){
 window=new BrowserWindow({title:'知枝',icon:path.join(root,'dist','app-icon.png'),width:1440,height:960,minWidth:760,minHeight:560,show:!smoke,backgroundColor:'#faf9f7',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false,spellcheck:false}});
 window.on('close',event=>{if(!quitting){event.preventDefault();app.quit();}});
 const wc=window.webContents;
 wc.on('render-process-gone',async(_event,details)=>{
  diagnostic('renderer-gone',details);if(quitting||window.isDestroyed())return;
  if(recoveries++<2){diagnostic('renderer-recover');wc.reload();return;}
  const answer=await dialog.showMessageBox(window,{type:'error',title:'显示页面中断',message:'已保留本机学习数据。重新载入后，可点击原节点继续生成，已完成的教材结果会复用。',buttons:['重新载入','稍后'],defaultId:0});
  if(answer.response===0&&!window.isDestroyed())wc.reload();
 });
 wc.on('unresponsive',()=>diagnostic('renderer-unresponsive'));
 wc.on('responsive',()=>diagnostic('renderer-responsive'));
 wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 wc.session.setPermissionCheckHandler(()=>false);
 wc.setWindowOpenHandler(({url})=>{openRelease(url).catch(()=>{});return {action:'deny'};});
 wc.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();openRelease(url).catch(()=>{});}});
 wc.on('will-attach-webview',event=>event.preventDefault());
 wc.session.on('will-download',async(event,item)=>{const url=item.getURL();if(!url.startsWith('blob:'+origin+'/')&&!url.startsWith(origin+'/')){event.preventDefault();return;}if(smoke){event.preventDefault();return;}item.setSaveDialogOptions({title:'导出知识图',defaultPath:item.getFilename()});});
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform==='darwin'?[{label:'知枝',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]}]:[]),
  {label:'编辑',submenu:[{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'窗口',submenu:[{role:'minimize'},{role:'togglefullscreen'},...(process.platform==='win32'?[{role:'quit'}]:[])]},
  {label:'帮助',submenu:[{label:'查看新版本',click:()=>openRelease('https://github.com/mmasondu114/zhizhi/releases')}]}]));
 await window.loadURL(origin);
 await wc.setVisualZoomLevelLimits(1,1);
 if(smoke){
  let ready=false;for(let i=0;i<60;i++){ready=await wc.executeJavaScript("Boolean(document.querySelector('.topbar')&&document.querySelector('.react-flow'))");if(ready)break;await new Promise(r=>setTimeout(r,150));}
  const isolated=await wc.executeJavaScript("typeof window.require==='undefined' && typeof window.process==='undefined'");
  if(!ready||!isolated)throw new Error('桌面窗口加载或隔离检查失败');
  console.log(JSON.stringify({desktop:true,windowCount:BrowserWindow.getAllWindows().length,sandbox:wc.getLastWebPreferences().sandbox,isolated,loaded:true}));
  app.quit();
 }
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if(quitting)return;diagnostic('quit-requested');event.preventDefault();quitting=true;(async()=>{let saved=true,timer;if(window&&!window.isDestroyed()){try{saved=await Promise.race([window.webContents.executeJavaScript("typeof window.zhizhiFlush==='function'?window.zhizhiFlush():true"),new Promise(resolve=>timer=setTimeout(()=>resolve(false),15000))]);}catch{saved=false;}finally{clearTimeout(timer);}}if(!saved&&!smoke){quitting=false;await dialog.showMessageBox(window,{type:'error',title:'尚未保存',message:'保存暂未完成，窗口已保留。请重试保存后再退出。'});return;}if(!saved)process.exitCode=1;await stopBackend();app.exit(process.exitCode||0);})().catch(()=>app.exit(1));});
 app.whenReady().then(startBackend).then(createWindow).catch(async error=>{process.exitCode=1;if(smoke)console.error(error.message);else await dialog.showMessageBox({type:'error',title:'知枝暂时无法启动',message:error.message});app.quit();});
}

