import React from 'react';
export default function OperationGuide(){return <div className="operation-guide">
 <p>从一个知识点开始，按自己的节奏展开。</p>
 <dl>
  <div><dt>展开与收起</dt><dd>单击知识卡片；已经准备好的概念会直接展开。再次单击收起分支，末级概念打开详情。</dd></div>
  <div><dt>提问与练习</dt><dd>右键卡片，可以提问、查看原理，或选择“给我一个例子”进入练习。</dd></div>
  <div><dt>移动与归位</dt><dd>拖动卡片调整位置。靠近拖动前的位置时出现吸附框，松开即可归位。</dd></div>
  <div><dt>缩放与平移</dt><dd>滚轮缩放，拖动空白画布平移。右下角可切换为滚轮平移；此时按住 Ctrl / ⌘ 滚轮缩放，Shift 滚轮横向平移。</dd></div>
  <div><dt>框选与复制</dt><dd>在空白画布按住右键拖动框选。选中后可批量复制、折叠或删除；Ctrl / ⌘ C 复制，Ctrl / ⌘ V 粘贴。</dd></div>
  <div><dt>撤销与定位</dt><dd>Ctrl / ⌘ Z 撤销，Shift + Ctrl / ⌘ Z 重做。右下角可回到根节点、适应全部或聚焦当前分支。</dd></div>
 </dl>
</div>;}
