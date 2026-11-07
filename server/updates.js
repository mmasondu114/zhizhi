import fs from 'node:fs/promises';
export const APP_ID='io.github.mmasondu114.zhizhi';
const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
export const APP_VERSION=pkg.version;
export const RELEASE_REPOSITORY='mmasondu114/zhizhi';
export const RELEASES_URL=`https://github.com/${RELEASE_REPOSITORY}/releases`;
export function newerVersion(candidate,current=APP_VERSION){
 const parse=v=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(v)?.slice(1).map(Number);
 const a=parse(candidate),b=parse(current);if(!a||!b)return false;
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
export function releaseSummary(release){
 const version=String(release.tag_name||'').replace(/^v/,'');
 if(!/^\d+\.\d+\.\d+$/.test(version)||release.draft||release.prerelease)throw new Error('发布版本格式不正确');
 const asset=release.assets?.find(a=>a.name===`Zhizhi-${version}-macos-arm64.pkg`);
 const expected=`https://github.com/${RELEASE_REPOSITORY}/releases/download/${release.tag_name}/${asset?.name}`;
 return {currentVersion:APP_VERSION,version,available:newerVersion(version),releaseUrl:`${RELEASES_URL}/tag/${release.tag_name}`,downloadUrl:asset?.browser_download_url===expected?expected:null};
}
let cached;
export async function checkForUpdates(){
 if(cached&&Date.now()-cached.time<60000)return cached.value;
 const response=await fetch(`https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Zhizhi/'+APP_VERSION},signal:AbortSignal.timeout(10000)});
 if(response.status===404)return {currentVersion:APP_VERSION,version:APP_VERSION,available:false,releaseUrl:RELEASES_URL,downloadUrl:null,message:'尚未发布可下载版本'};
 if(!response.ok)throw new Error(response.status===403||response.status===429?'检查更新暂时受限，请稍后重试':'无法获取 GitHub 版本信息');
 const value=releaseSummary(await response.json());cached={time:Date.now(),value};return value;
}
