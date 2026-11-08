import UpdatePanel from './UpdatePanel';
import React,{useState} from 'react';
export default function SettingsForm({settings,clients,onSave,notify,refreshClients,api,onConnectionChange=()=>{}}){
 const [kind,setKind]=useState(settings.selected==='demo'?'codex':settings.selected);
 const [drafts,setDrafts]=useState({}),[working,setWorking]=useState(false),[result,setResult]=useState('');
 const values={...settings.providers[kind],...drafts[kind]},cli=kind==='codex'||kind==='claude',group=cli?'client':kind==='demo'?'demo':'api';
 const change=(key,value)=>setDrafts(d=>({...d,[kind]:{...d[kind],[key]:value}}));
 const choose=k=>{setKind(k);setResult('');};
 const save=()=>onSave({selected:kind,...(kind!=='demo'?{provider:{...values,kind,hasKey:undefined,secret:undefined}}:{})});
 const connect=async e=>{e.preventDefault();setWorking(true);setResult(kind==='demo'?'正在切换…':'正在测试连接，通常需要十几秒…');try{await save();onConnectionChange({kind,status:kind==='demo'?'disconnected':'connecting'});if(kind!=='demo'){const r=await api('/test',{method:'POST',body:JSON.stringify({kind})});onConnectionChange(r.connection||{kind,status:'connected'});setResult('已连接 · '+r.message);}else setResult('已使用离线示例，不调用 AI');change('key','');}catch(e){onConnectionChange({kind,status:'error'});setResult('连接未完成：'+e.message);}finally{setWorking(false);}};
 return <form className="settings-content simple-settings" onSubmit={connect}>
 <p className="settings-intro">选一种方式，连接后就能点击知识点继续探索。</p>
 <div className="connection-choices" role="tablist" aria-label="连接方式">
 {[['client','本机客户端'],['api','API 接入'],['demo','离线示例']].map(([g,label])=><button type="button" role="tab" aria-selected={group===g} key={g} disabled={working} onClick={()=>choose(g==='client'?'codex':g==='api'?'openai':'demo')}>{label}</button>)}
 </div>
 {cli?<><div className="client-choices">{[['codex','Codex'],['claude','Claude Code']].map(([k,label])=><button type="button" key={k} disabled={working} className={kind===k?'selected':''} onClick={()=>choose(k)}>{label}<small>{clients[k]?.installed?'已检测到客户端':clients[k]?.status||'检测中…'}</small></button>)}</div>
 <div className="connect-explainer"><strong>已在客户端登录？直接连接。</strong><p>不用填写 API Key、地址或模型名。使用客户端当前的登录和默认模型。</p><button type="button" className="text-btn" onClick={()=>refreshClients().catch(e=>notify(e.message))}>重新检测</button></div>
 {clients[kind]?.installed===false&&<p className="connection-result">{clients[kind].status}。请安装并登录客户端，或改用 API 接入。</p>}</>:
 kind==='demo'?<div className="connect-explainer"><strong>不连接，也可以先体验</strong><p>展开 z-score 预置知识树和示例问答。自由生成其他内容需要连接模型。</p></div>:
 <><label>接口类型<select aria-label="接口类型" disabled={working} value={kind} onChange={e=>choose(e.target.value)}><option value="openai">OpenAI 兼容（含本地服务）</option><option value="anthropic">Anthropic</option></select></label>
 <label>服务地址<input aria-label="服务地址" disabled={working} required type="url" value={values.baseUrl||''} placeholder={kind==='openai'?'https://你的服务地址/v1':'https://api.anthropic.com/v1'} onChange={e=>change('baseUrl',e.target.value)} onBlur={e=>change('baseUrl',e.target.value.trim().replace(/\/(chat\/completions|messages)\/?$/,'').replace(/\/$/,''))}/></label>
 <label>API Key <span className="optional">{settings.providers[kind]?.hasKey?'已保存 · 留空沿用':'本地无密钥服务可留空'}</span><input aria-label="API Key" disabled={working} type="password" autoComplete="off" value={drafts[kind]?.key||''} placeholder="粘贴你的密钥" onChange={e=>change('key',e.target.value)}/></label>
 <label>模型名称<input aria-label="模型名称" disabled={working} required value={values.model||''} placeholder="填写服务提供的模型 ID" onChange={e=>change('model',e.target.value)}/></label></>}
 {kind!=='demo'&&<details className="advanced-settings"><summary>高级选项</summary>
 {cli&&<><label>模型名称（留空使用客户端默认值）<input disabled={working} value={values.model||''} onChange={e=>change('model',e.target.value)}/></label><label>可执行文件路径（自动检测，可留空）<input disabled={working} value={values.clientPath||''} onChange={e=>change('clientPath',e.target.value)}/></label><p className="muted">{clients[kind]?.version} · {clients[kind]?.status||'检测中'}</p></>}
 <label>请求超时（秒）<input type="number" min="1" max="600" disabled={working} value={(values.timeoutMs||120000)/1000} onChange={e=>change('timeoutMs',Number(e.target.value)*1000)}/></label>
 {!cli&&<label className="checkline"><input type="checkbox" disabled={working} checked={!!values.clearKey} onChange={e=>change('clearKey',e.target.checked)}/>清除已保存密钥</label>}
 <p className="muted">{cli?'复用官方登录，不读取私有凭据。客户端工具能力已受限；订阅不等于第三方 API 额度。':'密钥仅保存在本机后端，不进入知识图导出。'}</p>
 <button type="button" className="secondary" disabled={working} onClick={async()=>{try{await save();change('key','');setResult('配置已保存，尚未测试连接');}catch(e){notify(e.message);}}}>仅保存配置</button></details>}
 {result&&<div className="connection-result" role="status">{result}</div>}
 <button className="primary full connect-primary" disabled={working||(cli&&clients[kind]?.installed===false&&!values.clientPath)} type="submit">{working?'正在连接…':kind==='demo'?'使用离线示例':'连接并使用'}</button>
 <p className="connection-privacy">只在你展开节点或提问时发送相关学习内容。</p>
 <UpdatePanel api={api}/>
 </form>;
}
