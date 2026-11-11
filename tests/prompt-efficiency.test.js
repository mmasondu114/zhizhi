import test from 'node:test';
import assert from 'node:assert/strict';
import {providerSystem,compactProviderContext,SYSTEM} from '../server/providers.js';
import {hierarchySchema} from '../shared/protocol.js';

test('structured clients send schema once; API clients retain the format contract',()=>{
 const schema=JSON.stringify(hierarchySchema);
 for(const kind of ['codex','claude']){
  const prompt=providerSystem(kind,'hierarchy-synthesis',hierarchySchema);
  assert.ok(!prompt.includes(schema));
  assert.ok(prompt.length<1000);
  assert.ok(prompt.includes('每一步解释理由'));
 }
 for(const kind of ['openai','anthropic'])assert.ok(providerSystem(kind,'hierarchy-synthesis',hierarchySchema).includes(schema));
 const review=providerSystem('codex','lesson-review',hierarchySchema);
 assert.ok(review.includes('中文翻译'));assert.ok(!review.includes('每一步解释理由'));
 assert.ok(SYSTEM.includes('思维导图'));
});

test('request compaction retains all textbook evidence and reviewed lessons without duplicate drafts',()=>{
 const text='Original textbook evidence. '.repeat(500);
 const context={generationTask:'lesson-review',document:'A.pdf',materials:[{id:'a',file:'A.pdf',page:1,text}],allowedSourceIds:['a','b'],sourceLanguageContext:[{file:'A.pdf',samples:[text.slice(0,1000),'Evidence from another batch']},{file:'B.pdf',samples:[text.slice(0,1000)]}],candidates:[{detail:'Earlier draft'.repeat(1000)}],existing:[{title:'Concept',detail:'Corrected explanation',example:'Worked steps',sources:['a']}]};
 const before=JSON.stringify(context),compact=compactProviderContext(context);
 assert.equal(JSON.stringify(context),before);
 assert.deepEqual(compact.materials,[{id:'a',page:1,text}]);
 assert.deepEqual(compact.existing,context.existing);
 assert.deepEqual(compact.allowedSourceIds,['a','b']);
 assert.equal('candidates' in compact,false);
 assert.deepEqual(compact.sourceLanguageContext,[{file:'A.pdf',samples:['Evidence from another batch']},{file:'B.pdf',samples:[text.slice(0,1000)]}]);
 assert.ok(JSON.stringify(compact).length<before.length-10000);
 assert.deepEqual(compactProviderContext({document:'A.pdf',materials:[{file:'A.pdf',id:'a',text}],sourceLanguageContext:[{file:'A.pdf',samples:[text.slice(0,1000)]}]}),{document:'A.pdf',materials:[{id:'a',text}]});
});
