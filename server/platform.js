import os from 'node:os';
import path from 'node:path';

export function defaultDataDir({platform=process.platform,home=os.homedir(),env=process.env,root}={}){
 if(env.TREE_DATA_DIR)return path.resolve(env.TREE_DATA_DIR);
 if(platform==='darwin')return path.join(home,'Library','Application Support','Zhizhi');
 return path.join(root,'data');
}

export function macClientCandidates(kind,home=os.homedir()){
 const candidates=[path.join(home,'.local','bin',kind),path.join(home,'.cargo','bin',kind),'/opt/homebrew/bin/'+kind,'/usr/local/bin/'+kind];
 if(kind==='codex')candidates.push('/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',path.join(home,'Applications','ChatGPT.app','Contents','Resources','codex-cli','bin','codex'),'/Applications/Codex.app/Contents/Resources/codex',path.join(home,'Applications','Codex.app','Contents','Resources','codex'));
 return candidates;
}

