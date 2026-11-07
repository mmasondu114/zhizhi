import React,{useState} from 'react';
export default function UpdatePanel({api}){
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="update-panel"><div><span>知枝 · v{__APP_VERSION__}</span><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setResult(await api('/updates'));}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'正在检查…':'检查更新'}</button></div>
 {error&&<p role="status">{error}</p>}{result&&<p role="status">{result.available?`新版本 ${result.version} 已发布。`:result.message||'当前已是最新版本。'} {result.available&&<a href={result.downloadUrl||result.releaseUrl} target="_blank" rel="noopener noreferrer">{result.downloadUrl?'下载安装包':'查看发布页面'}</a>}</p>}
 {result?.available&&<small>退出知枝后安装新版本，已有知识图保留。更新由你确认安装。</small>}</div>;
}
