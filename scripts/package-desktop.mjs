import {packager} from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
const [platform,arch,stage,out,icon]=process.argv.slice(2);
if(!['win32','darwin'].includes(platform)||!['x64','arm64'].includes(arch))throw new Error('Invalid desktop target');
const root=path.resolve(import.meta.dirname,'..'),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const shellDir=path.join(stage,'desktop-shell');await fs.mkdir(shellDir,{recursive:true});
await fs.copyFile(path.join(root,'desktop','main.cjs'),path.join(shellDir,'main.cjs'));
await fs.writeFile(path.join(shellDir,'package.json'),JSON.stringify({name:'zhizhi-desktop',version:pkg.version,main:'main.cjs',productName:'知枝'}));
const resources=[path.join(stage,'backend'),path.join(stage,'runtime')];
if(platform==='darwin')resources.push(path.join(stage,'zhizhi-keychain'));
// Node fs.cp resolves copied symlinks to their original staging paths by default.
// Rewrite only internal resource links before signing; no build-machine paths may escape.
async function repairResourceLinks({buildPath}){
 if(platform!=='darwin')return;
 const targetRoot=path.join(buildPath,'Contents','Resources');let repaired=0;
 async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isSymbolicLink()){
   const linked=path.resolve(path.dirname(file),await fs.readlink(file));let mapped;
   for(const source of resources){const relative=path.relative(path.resolve(source),linked);if(relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)){mapped=path.join(targetRoot,path.basename(source),relative);break;}}
   if(!mapped){const relative=path.relative(targetRoot,linked);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('External resource symlink: '+file);mapped=linked;}
   await fs.access(mapped);await fs.unlink(file);await fs.symlink(path.relative(path.dirname(file),mapped),file);repaired++;
  }else if(entry.isDirectory())await walk(file);
 }}
 for(const source of resources){const target=path.join(targetRoot,path.basename(source));if((await fs.stat(target)).isDirectory())await walk(target);}
 console.log('Verified internal resource links: '+repaired);
}
const results=await packager({dir:shellDir,out,name:'Zhizhi',executableName:'Zhizhi',platform,arch,electronVersion:pkg.devDependencies.electron,appVersion:pkg.version,appBundleId:'io.github.mmasondu114.zhizhi',icon,asar:true,prune:false,overwrite:true,extraResource:resources,afterCopyExtraResources:[repairResourceLinks],...(platform==='darwin'?{osxSign:{identity:process.env.MAC_APP_SIGN_IDENTITY||'-',identityValidation:!!process.env.MAC_APP_SIGN_IDENTITY,hardenedRuntime:!!process.env.MAC_APP_SIGN_IDENTITY,gatekeeperAssess:false},extendInfo:{CFBundleDisplayName:'知枝',LSMinimumSystemVersion:'14.0'}}:{win32metadata:{CompanyName:'Zhizhi',FileDescription:'知枝 · 交互式知识树',ProductName:'知枝'}})});
console.log('Desktop bundle: '+results[0]);
