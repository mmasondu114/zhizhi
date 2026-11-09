import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
const app=path.resolve(process.argv[2]);
const root=path.resolve(import.meta.dirname,'..');
const resources=path.join(app,'Contents','Resources');
await exec('codesign',['--verify','--deep','--strict',app]);
// Examine the real signatures, including every Electron helper. A bundle
// can pass strict signature verification yet still be rejected by dyld.
async function signature(file){
 const {stderr}=await exec('codesign',['--display','--verbose=4',file]);
 const adhoc=/Signature=adhoc/.test(stderr);
 const hardened=/flags=0x[\da-f]+\([^)]*\bruntime\b/.test(stderr);
 assert.ok(!(adhoc&&hardened),'Ad-hoc bundle must not enable hardened runtime: '+file);
 return stderr.match(/TeamIdentifier=(.*)/)?.[1];
}
const team=await signature(app);
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 if(!entry.isDirectory())continue;
 const file=path.join(dir,entry.name);
 if(/\.(app|framework)$/.test(entry.name))assert.equal(await signature(file),team,'Nested code signing team differs: '+file);
 await walk(file);
}}
await walk(path.join(app,'Contents','Frameworks'));
const iconName=(await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIconFile',path.join(app,'Contents','Info.plist')])).stdout.trim();
assert.ok(iconName&&!iconName.includes('/'),'Missing bundle icon');
const icon=await fs.readFile(path.join(resources,iconName.endsWith('.icns')?iconName:iconName+'.icns'));
assert.equal(icon.subarray(0,4).toString(),'icns');
assert.ok(icon.length>10000,'Application icon is unexpectedly small');
const hash=data=>createHash('sha256').update(data).digest('hex');
const expected=hash(await fs.readFile(path.join(root,'public','app-icon.png')));
assert.equal(hash(await fs.readFile(path.join(resources,'backend','dist','app-icon.png'))),expected,'Packaged UI icon is stale');
// Compare the ICNS to one generated from the same canonical source image.
const manifest=JSON.parse(await fs.readFile(path.join(resources,'backend','build-info.json'),'utf8'));
assert.equal(manifest.iconPngSha256,expected,'Build used a stale source icon');
assert.equal(manifest.iconIcnsSha256,hash(icon),'Bundle icon differs from the generated icon');
console.log('Verified bundle signatures and synchronized application icon');
