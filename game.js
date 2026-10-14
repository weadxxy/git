const $ = (id) => document.getElementById(id);
if (window.lumenfall?.isDesktop) {
  document.documentElement.classList.add('desktop');
  document.title = '微光之境 · Lumenfall';
  document.querySelector('.version').textContent = 'DESKTOP · v1.1';
  document.querySelector('footer > span:last-child').textContent = 'F11 全屏 · Ctrl + Q 退出';
}
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const W = 960, H = 540, WORLD = 5200, REQUIRED = 8;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lightCanvas = document.createElement('canvas');
lightCanvas.width = W / 2; lightCanvas.height = H / 2;
const light = lightCanvas.getContext('2d');
const keys = new Set();
let mode = 'intro', camera = 0, elapsed = 0, lastTime = 0, gameTime = 0, shake = 0;
let score = 0, kills = 0, checkpoint = 0, toastTime = 0, lastHUD = '', previousMode = 'intro', modalKind = '';
let audioCtx, musicTimer, soundEnabled = false, musicStep = 0, lastFootstep = 0;
let player, particles = [], enemies = [], crystals = [], echoes = [];
const platforms = [
  [0, 452, 770, 130], [855, 470, 660, 130], [1605, 450, 640, 130],
  [2355, 468, 680, 130], [3140, 448, 820, 130], [4060, 465, 1140, 130],
  [270, 374, 120, 22], [462, 310, 118, 22], [660, 363, 100, 22],
  [1040, 390, 130, 24], [1270, 325, 130, 24], [1465, 375, 100, 24],
  [1780, 366, 110, 24], [1970, 295, 136, 24], [2205, 367, 110, 24],
  [2530, 380, 130, 24], [2755, 310, 135, 24], [2970, 365, 108, 24],
  [3310, 362, 120, 24], [3535, 292, 140, 24], [3850, 370, 130, 24],
  [4260, 380, 125, 24], [4470, 315, 135, 24], [4680, 380, 125, 24]
].map(([x, y, w, h], i) => ({ x, y, w, h, ground: i < 6 }));
const crystalLocations = [[330,340],[520,276],[1105,355],[1335,290],[1830,332],[2040,260],
  [2595,345],[2820,276],[3370,327],[3600,258],[4320,345],[4540,280]];
const enemyLocations = [[610,452,510,730],[1200,470,960,1440],[1920,450,1680,2160],
  [2690,468,2420,2960],[3670,448,3280,3870],[4550,465,4180,4760]];
const checkpoints = [{x:1740,y:450},{x:3240,y:448}];
const gate = { x:4935, y:465 };

function random(seed) {
  let a = seed | 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rng = random(2026);
const stars = Array.from({ length: 95 }, () => ({ x: rng()*W, y:rng()*330, s:rng()>.85?2:1, p:rng()*6 }));
const flies = Array.from({length:reducedMotion?35:90}, () => ({x:rng()*WORLD,y:180+rng()*290,p:rng()*7,s:rng()*1.5+1}));
const trees = [0,1,2].map(layer => Array.from({length:36},(_,i)=>({x:i*160+rng()*100,y:layer===0?390:layer===1?440:510,h:155+rng()*230,w:15+rng()*24,p:rng()*10,seed:i*31+layer*510})));
// A clearing lets the moon and the distant observatory breathe.
trees.forEach(layer=>layer.forEach(t=>{if(t.x>535&&t.x<860)t.h*=.53;}));
const terrainDetail = platforms.map((p,i)=>{
  const r=random(i*771+13);
  return {
    grass:Array.from({length:Math.floor(p.w/4)},()=>({x:r()*p.w,h:2+r()*8,c:r()})),
    stones:Array.from({length:Math.floor(p.w*p.h/300)},()=>({x:r()*p.w,y:10+r()*(p.h-12),w:3+r()*17,h:2+r()*6,c:r()})),
    plants:Array.from({length:Math.floor(p.w/48)},()=>({x:12+r()*(p.w-24),type:r(),size:5+r()*10,p:r()*6})),
    vines:Array.from({length:Math.floor(p.w/32)},()=>({x:r()*p.w,len:10+r()*45}))
  };
});

function reset() {
  player = { x:158,y:410,w:18,h:32,vx:0,vy:0,face:1,health:3,grounded:false,jumps:0,coyote:0,inv:0,dash:0,dashCD:0,attack:0,attackCD:0,step:0 };
  crystals = crystalLocations.map(([x,y],i)=>({x,y,taken:false,p:i*2.1}));
  enemies = enemyLocations.map(([x,y,min,max],i)=>({x,y:y-25,w:25,h:25,min,max,vx:i%2?-36:36,health:2,hit:0}));
  score=0;kills=0;checkpoint=0;gameTime=0;camera=0;shake=0;particles=[];echoes=[];keys.clear();lastHUD='';
  updateHUD();
}
function rect(x,y,w,h,color) { ctx.fillStyle=color;ctx.fillRect(Math.floor(x),Math.floor(y),Math.ceil(w),Math.ceil(h)); }
function glow(x,y,r,color,power=1) {
  x/=2;y/=2;r/=2;
  const g=light.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`${color}${Math.round(140*power).toString(16).padStart(2,'0')}`);
  g.addColorStop(.3,`${color}${Math.round(55*power).toString(16).padStart(2,'0')}`);
  g.addColorStop(1,`${color}00`);
  light.fillStyle=g;light.fillRect(x-r,y-r,r*2,r*2);
}
function burst(x,y,color,count=14,speed=80) {
  for(let i=0;i<count;i++) {const a=Math.random()*Math.PI*2,s=speed*(.3+Math.random());particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.4+Math.random()*.6,max:1,size:1+Math.random()*3,color,g:65});}
}
function toast(text,duration=3) { $('toast').textContent=text;$('toast').classList.add('visible');toastTime=duration; }
function tone(freq,duration=.15,type='sine',volume=.035,delay=0) {
  if(!soundEnabled||!audioCtx)return;
  const t=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+duration+.03);
}
function sfx(kind) {
  if(kind==='collect'){tone(880,.25,'sine',.07);tone(1320,.35,'sine',.045,.07);tone(1760,.5,'sine',.025,.14);}
  if(kind==='jump'){tone(320,.12,'triangle',.04);tone(480,.15,'sine',.025,.04);}
  if(kind==='attack'){tone(150,.12,'sawtooth',.025);tone(80,.13,'triangle',.04,.02);}
  if(kind==='dash'){tone(620,.15,'triangle',.035);tone(310,.18,'sine',.03,.05);}
  if(kind==='hurt'){tone(110,.22,'square',.03);tone(73,.25,'triangle',.04,.05);}
  if(kind==='win'){[523.25,659.25,783.99,1046.5,1318.5].forEach((f,i)=>tone(f,1.4,'sine',.05,i*.16));}
}
async function setSound(enabled) {
  soundEnabled=enabled;
  if(enabled){
    try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();await audioCtx.resume();}
    catch{soundEnabled=false;toast('当前浏览器暂不支持声音');}
  }
  $('sound-button').setAttribute('aria-pressed',String(soundEnabled));
  $('sound-button').setAttribute('aria-label',soundEnabled?'关闭声音':'开启声音');
  $('sound-button').title=soundEnabled?'关闭声音':'开启声音';
  $('sound-wave').setAttribute('d',soundEnabled?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 6 6m0-6-6 6');
  clearInterval(musicTimer);
  if(soundEnabled){
    const notes=[220,329.63,440,493.88,392,329.63,261.63,293.66];
    const play=()=>{if(mode==='paused')return;tone(notes[musicStep%notes.length],2.8,'sine',.019);if(musicStep%4===0)tone(110,4,'sine',.025);musicStep++;};
    play();musicTimer=setInterval(play,1500);
  }
}

function start() {
  reset();mode='playing';$('game-frame').classList.add('playing');$('intro').inert=true;
  $('modal').hidden=true;$('pause-button').disabled=false;$('status-text').textContent='循着微光，向右探索';
  canvas.focus({preventScroll:true});toast('A / D 移动 · 空格二段跳 · J 挥剑 · K 冲刺',5);
}
function openModal(kind) {
  if(mode==='paused'&&kind==='pause'){closeModal();return;}
  previousMode=mode;modalKind=kind;keys.clear();
  document.querySelectorAll('[data-control]').forEach(b=>b.classList.remove('active'));
  if(kind==='pause'||kind==='help')mode='paused';
  const content={
    pause:['TAKE A LITTLE BREATH','让微光，等一等。','<p>森林会为你保留这一刻。<br>准备好后，再继续向前。</p>','继续旅途'],
    help:['A GUIDE FOR THE WANDERER','带上微光，出发吧。','<p>收集至少 8 枚光之碎片，抵达最右侧的星门。<br>点亮路灯即可保存复活位置并恢复生命。</p><div class="help-grid"><div><kbd>A</kbd><kbd>D</kbd> / 方向键 · 移动</div><div><kbd>SPACE</kbd> 二段跳</div><div><kbd>J</kbd> 挥剑击退暗影</div><div><kbd>K</kbd> / Shift · 冲刺</div><div><kbd>ESC</kbd> 暂停游戏</div><div>触屏 · 使用屏幕按钮</div></div>','知道了'],
    dead:['EVEN STARS NEED TO REST','微光，还未熄灭。','<p>每次跌倒，都是另一段旅途的开始。<br>收集的碎片会保留，从最近的路灯继续。</p>','重新点亮'],
    won:['EVERY LITTLE LIGHT MATTERS','你让森林，再次发光。',`<p>星门已苏醒，所有微光都找到了归处。<br>收集 ${score} / 12 枚碎片 · 驱散 ${kills} 只暗影<br>旅途用时 ${Math.floor(gameTime/60)} 分 ${Math.floor(gameTime%60)} 秒</p>`,'再走一段旅途']
  }[kind];
  $('modal-eyebrow').textContent=content[0];$('modal-title').textContent=content[1];$('modal-description').innerHTML=content[2];
  $('modal-primary').innerHTML=`${content[3]} <span>→</span>`;
  $('restart-button').hidden=kind==='won'||(kind==='help'&&previousMode==='intro');
  $('modal').hidden=false;$('modal-primary').focus({preventScroll:true});
}
function closeModal(){
  $('modal').hidden=true;mode=previousMode;
  if(mode==='intro')$('start-button').focus({preventScroll:true});else canvas.focus({preventScroll:true});
}
function respawn(){
  const cp=checkpoint?checkpoints[checkpoint-1]:{x:158,y:452};
  Object.assign(player,{x:cp.x,y:cp.y-40,vx:0,vy:0,health:3,inv:2,jumps:0,dash:0,attack:0});
  mode='playing';$('modal').hidden=true;camera=Math.max(0,Math.min(WORLD-W,player.x-300));
  updateHUD();canvas.focus({preventScroll:true});toast('路灯还亮着，继续前行吧。');
}
function jump(){
  if(mode!=='playing')return;
  if(player.grounded||player.coyote>0||player.jumps<2){
    if(player.grounded||player.coyote>0)player.jumps=0;
    player.vy=player.jumps===0?-405:-365;player.jumps++;player.grounded=false;player.coyote=0;
    burst(player.x+9,player.y+32,'#b8deae',player.jumps===2?15:7,55);sfx('jump');
  }
}
function attack(){
  if(mode!=='playing'||player.attackCD>0)return;
  player.attack=.24;player.attackCD=.34;sfx('attack');
  const center=player.x+9+player.face*33;
  burst(center,player.y+14,'#e5edbd',7,95);
  enemies.forEach(e=>{
    if(e.health>0&&Math.abs(e.x+12-center)<57&&Math.abs(e.y+13-player.y-16)<48){
      e.health--;e.hit=.18;e.x=Math.max(e.min,Math.min(e.max,e.x+player.face*19));
      burst(e.x+12,e.y+12,'#b1f3d0',16,110);shake=reducedMotion?0:3;
      if(e.health===0){kills++;burst(e.x+12,e.y+12,'#ad94db',22,90);}
    }
  });
}
function dash(){
  if(mode!=='playing'||player.dashCD>0)return;
  player.dash=.17;player.dashCD=.95;player.inv=Math.max(player.inv,.23);player.vy=-18;sfx('dash');
  burst(player.x+9,player.y+18,'#b5efc6',12,70);
}
function hurt(direction){
  if(player.inv>0||mode!=='playing')return;
  player.health--;player.inv=1.5;player.vy=-205;player.vx=direction*230;shake=reducedMotion?0:7;sfx('hurt');
  burst(player.x+9,player.y+15,'#efb6a2',20,130);updateHUD();
  if(player.health<=0){mode='dead';openModal('dead');}
}
function updateHUD(){
  const key=`${score}:${player.health}`;
  if(key!==lastHUD){
    lastHUD=key;$('crystal-count').textContent=String(score).padStart(2,'0');
    $('hearts').innerHTML=[0,1,2].map(i=>`<span${i>=player.health?' class="empty"':''}>♥</span>`).join('');
    $('hearts').setAttribute('aria-label',`生命值 ${player.health} / 3`);
  }
  $('dash-fill').style.width=`${100*(1-Math.max(0,player.dashCD)/.95)}%`;
}

function update(dt){
  elapsed+=dt;
  if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('visible');}
  if(mode==='paused')return;
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;p.vx*=1-dt*.6;}
  particles=particles.filter(p=>p.life>0).slice(-500);
  for(const e of echoes)e.life-=dt;
  echoes=echoes.filter(e=>e.life>0);
  if(mode!=='playing')return;
  gameTime+=dt;
  for(const name of ['inv','dash','dashCD','attack','attackCD','coyote'])player[name]=Math.max(0,player[name]-dt);
  shake=Math.max(0,shake-dt*22);
  const direction=Number(keys.has('right'))-Number(keys.has('left'));
  if(direction)player.face=direction;
  if(player.dash>0){player.vx=player.face*570;player.vy=0;echoes.push({x:player.x,y:player.y,face:player.face,life:.22});}
  else{
    const target=direction*192;
    player.vx+=(target-player.vx)*Math.min(1,dt*(player.grounded?17:9));
    player.vy=Math.min(630,player.vy+1050*dt);
  }
  const oldBottom=player.y+player.h;
  player.x=Math.max(8,Math.min(WORLD-player.w-8,player.x+player.vx*dt));
  player.y+=player.vy*dt;
  const wasGrounded=player.grounded;player.grounded=false;
  for(const p of platforms){
    if(player.vy>=0&&player.x+player.w>p.x+2&&player.x<p.x+p.w-2&&oldBottom<=p.y+3&&player.y+player.h>=p.y){
      player.y=p.y-player.h;player.vy=0;player.grounded=true;player.jumps=0;player.coyote=.1;
      if(!wasGrounded)burst(player.x+9,p.y,'#8fae78',6,28);
      break;
    }
  }
  if(wasGrounded&&!player.grounded)player.coyote=.1;
  if(!player.grounded&&player.coyote<=0&&player.jumps===0)player.jumps=1;
  player.step+=Math.abs(player.vx)*dt*.075;
  if(player.grounded&&Math.abs(player.vx)>50&&elapsed-lastFootstep>.14){
    lastFootstep=elapsed;particles.push({x:player.x+9,y:player.y+31,vx:-player.vx*.1,vy:-15,life:.35,max:.35,size:2,color:'#a6c28c',g:10});
  }
  if(player.y>H+80){
    player.health--;updateHUD();
    if(player.health<=0){mode='dead';openModal('dead');return;}
    const cp=checkpoint?checkpoints[checkpoint-1]:{x:158,y:452};
    Object.assign(player,{x:cp.x,y:cp.y-40,vx:0,vy:0,inv:2,dash:0});toast('小心脚下的深谷。试试二段跳与冲刺。');
  }
  for(const c of crystals){
    if(!c.taken&&Math.abs(player.x+9-c.x)<24&&Math.abs(player.y+16-c.y)<30){
      c.taken=true;score++;burst(c.x,c.y,'#d9ffd2',30,110);sfx('collect');updateHUD();
      if(score===REQUIRED)toast('碎片已集齐！继续向右，唤醒森林尽头的星门。',5);
      else if(score===1)toast('第一枚光之碎片。还有微光，藏在前路。');
    }
  }
  for(const e of enemies){
    if(e.health<=0)continue;
    e.hit=Math.max(0,e.hit-dt);e.x+=e.vx*dt;
    if(e.x<e.min||e.x>e.max){e.x=Math.max(e.min,Math.min(e.max,e.x));e.vx*=-1;}
    if(player.x+player.w>e.x+4&&player.x<e.x+e.w-4&&player.y+player.h>e.y+4&&player.y<e.y+e.h){
      if(player.vy>70&&oldBottom<e.y+12){e.health=0;kills++;player.vy=-290;player.jumps=1;burst(e.x+12,e.y+10,'#bf9cde',24,90);tone(240,.12,'triangle',.04);}
      else hurt(player.x<e.x?-1:1);
    }
  }
  checkpoints.forEach((cp,i)=>{
    if(checkpoint<i+1&&Math.abs(player.x-cp.x)<40&&player.y>cp.y-100){
      checkpoint=i+1;player.health=3;burst(cp.x,cp.y-54,'#f5dd98',36,95);updateHUD();sfx('collect');toast('路灯已点亮 · 生命恢复 · 复活位置已记录');
    }
  });
  if(player.x>gate.x-65&&player.y>gate.y-130){
    if(score>=REQUIRED){mode='won';burst(gate.x,gate.y-65,'#d8f9a8',100,200);sfx('win');$('status-text').textContent='星门已苏醒 · 旅途完成';openModal('won');}
    else if(toastTime<=0)toast(`星门还需要 ${REQUIRED-score} 枚碎片。沿原路返回寻找，已收集的碎片会保留。`,4);
  }
  const target=Math.max(0,Math.min(WORLD-W,player.x-W*.36));
  camera+=(target-camera)*Math.min(1,dt*5);
  updateHUD();
}

function drawMountains(){
  const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#0c2328');bg.addColorStop(.45,'#1b3b37');bg.addColorStop(1,'#2e5340');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  for(const s of stars){ctx.globalAlpha=.25+.3*Math.sin(elapsed*.7+s.p)**2;rect((s.x-camera*.035+W)%W,s.y,s.s,s.s,'#b9dcc1');}ctx.globalAlpha=1;
  const mx=710-camera*.045;
  glow(mx,119,165,'#8ed8bb',.8);
  ctx.fillStyle='#b3cdb1';ctx.beginPath();ctx.arc(mx,114,39,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#c9d8b5';ctx.beginPath();ctx.arc(mx-3,111,34,0,Math.PI*2);ctx.fill();
  rect(mx-21,96,10,5,'#b1c7a6');rect(mx+9,119,12,7,'#b5caaa');rect(mx+17,104,5,4,'#b1c7a6');
  for(let layer=0;layer<3;layer++){
    const r=random(431+layer);const shift=camera*(.06+layer*.045);
    ctx.fillStyle=['#1a3838','#204541','#275047'][layer];ctx.beginPath();ctx.moveTo(-100,H);
    for(let x=-100;x<W+300;x+=28){const y=270+layer*31+Math.sin((x+shift)*.009+layer)*36+Math.sin((x+shift)*.021)*15+r()*15;ctx.lineTo(x,y);}
    ctx.lineTo(W+300,H);ctx.fill();
  }
  // The broken observatory, deep in the forest.
  const rx=601-camera*.15;
  rect(rx,245,81,145,'#254b44');rect(rx+12,229,57,35,'#294f46');rect(rx+23,212,14,30,'#2a5048');rect(rx+49,218,13,30,'#2a5048');
  rect(rx+24,269,12,27,'#173f3b');rect(rx+48,269,12,27,'#173f3b');rect(rx+33,330,21,60,'#193f39');
  rect(rx-20,335,118,8,'#31554a');rect(rx+5,310,72,5,'#31574a');
  for(let j=0;j<2;j++){
    const x=rx+93+j*29;rect(x,322,17,170,'#36695a');
    for(let i=0;i<20;i++){const y=324+(i*13+elapsed*50)%165;rect(x+3+(i%3)*3,y,2,8,'#5c9a7a');}
    glow(x,390,60,'#5ab995',.24);
  }
  // Slanting moonlight between tree canopies.
  ctx.save();ctx.globalCompositeOperation='screen';
  for(let i=0;i<4;i++){
    const x=590+i*56-camera*.08;
    const g=ctx.createLinearGradient(x,40,x-190,500);g.addColorStop(0,'#a6e4bb00');g.addColorStop(.4,'#b7edb708');g.addColorStop(1,'#b7edb700');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x,30);ctx.lineTo(x+15+i*7,30);ctx.lineTo(x-160+i*15,510);ctx.lineTo(x-260,510);ctx.fill();
  }ctx.restore();
}
function drawTree(t,layer){
  const factor=[.2,.42,.75][layer],x=Math.floor(t.x-camera*factor),y=t.y,h=t.h,w=t.w;
  if(x<-160||x>W+160)return;
  const colors=[['#1c3d36','#22483c','#2c5140'],['#122e2a','#17382d','#1d4232'],['#0c2421','#112f27','#19392b']][layer];
  rect(x,y-h,w,h,colors[0]);rect(x+w*.7,y-h+10,w*.18,h-10,colors[1]);
  rect(x-7,y-30,w+14,30,colors[0]);rect(x-16,y-11,w+31,11,colors[0]);
  const r=random(t.seed);
  for(let b=0;b<5;b++){
    const by=y-h+25+b*h*.15,side=b%2?-1:1,len=30+r()*70;
    rect(x+(side<0?-len:w-4),by,len+4,8,colors[0]);rect(x+(side<0?-len:w+len-12),by-21,8,25,colors[0]);
    const cx=x+w/2+side*len*.75;
    for(let k=0;k<9;k++){
      const bx=cx+(r()-.5)*110,by2=by-18-r()*28;
      rect(bx,by2,22+r()*44,9+r()*18,colors[k%3]);
    }
  }
  // Pixel clusters at the crown.
  for(let k=0;k<22;k++){
    const bx=x+w/2+(r()-.5)*155,by=y-h-20+(r()-.5)*70;
    rect(bx,by,18+r()*50,10+r()*24,colors[k%3]);
  }
  for(let k=0;k<38;k++){
    const bx=x+w/2+(r()-.5)*170,by=y-h-20+(r()-.5)*85;
    rect(bx,by,3+r()*9,2+r()*5,colors[k%3]);
  }
  if(layer>0){
    const vx=x+w+18;ctx.strokeStyle='#42604455';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(vx,y-h+10);ctx.bezierCurveTo(vx+15,y-h+80,vx-12,y-h+95,vx+8,y-h+130);ctx.stroke();
    for(let i=0;i<5;i++)rect(vx+(i%2?4:-2),y-h+42+i*17,5,2,'#3e664753');
  }
}
function drawTerrain(){
  platforms.forEach((p,index)=>{
    const x=Math.floor(p.x-camera);if(x+p.w<-20||x>W+20)return;
    const d=terrainDetail[index];
    rect(x,p.y,p.w,p.h,p.ground?'#14251f':'#1e3327');
    rect(x,p.y+7,p.w,8,'#30452d');rect(x,p.y,p.w,5,'#769457');rect(x,p.y+1,p.w,2,'#95ad65');
    for(const s of d.stones)rect(x+s.x,p.y+s.y,s.w,s.h,s.c>.7?'#2b3c28':s.c>.3?'#1d3024':'#10241e');
    for(const g of d.grass){
      rect(x+g.x,p.y-g.h,2,g.h,g.c>.65?'#a3b36d':g.c>.3?'#6f8e4e':'#456e43');
      if(g.h>6)rect(x+g.x-2,p.y-g.h+3,2,3,'#729450');
    }
    if(!p.ground){
      for(const v of d.vines){
        rect(x+v.x,p.y+p.h,2,v.len,'#3d6340');
        for(let j=6;j<v.len;j+=9)rect(x+v.x+(j%2?2:-3),p.y+p.h+j,4,3,'#4d7747');
      }
      rect(x+6,p.y+p.h,p.w-12,4,'#172a22');
    }
    for(const plant of d.plants){
      const px=x+plant.x,py=p.y;
      if(plant.type>.64){
        // Small, luminous mushrooms.
        const size=plant.size*.55;rect(px,py-size,2,size,'#8fb49a');rect(px-size*.5,py-size-3,size+3,4,'#82c5a1');rect(px-size*.5+2,py-size-5,size-1,2,'#a0d8ac');
        glow(px,py-size,27,'#6be5ae',.25);rect(px+size+5,py-5,2,5,'#7a9a7f');rect(px+size+2,py-7,7,3,'#599b80');
      }else if(plant.type>.3){
        for(let f=0;f<4;f++){const sy=py-f*3;rect(px-f*2,sy,2+f*4,2,'#4a7946');}rect(px,py-14,2,14,'#6b9250');
      }else{
        rect(px,py-8,2,8,'#4b7351');rect(px-2,py-10,6,3,'#b8be79');rect(px,py-12,2,6,'#dae1a1');
      }
    }
  });
}
function drawCrystal(c){
  if(c.taken)return;const x=c.x-camera,y=c.y+Math.sin(elapsed*2.2+c.p)*4;
  if(x<-30||x>W+30)return;
  glow(x,y,48,'#88e7be',.8);
  rect(x-2,y-9,4,3,'#e4ffdf');rect(x-4,y-6,8,5,'#b8f5d3');rect(x-6,y-1,12,3,'#8fe4bc');rect(x-4,y+2,8,4,'#a4ecc4');rect(x-2,y+6,4,3,'#d0f9d5');
  rect(x,y-6,2,11,'#edffe3');
  const a=elapsed*1.6+c.p;rect(x+Math.cos(a)*14,y+Math.sin(a)*8,1,1,'#d5f7c1');
}
function drawLantern(cp,i){
  const x=cp.x-camera,y=cp.y,active=checkpoint>i;
  if(x<-70||x>W+70)return;
  rect(x-3,y-68,6,68,'#3d4930');rect(x-6,y-5,12,5,'#556044');rect(x-3,y-70,25,4,'#64704b');rect(x+18,y-67,2,9,'#81915e');
  rect(x+13,y-59,12,17,'#9c9d65');rect(x+15,y-57,8,12,active?'#f9e4a2':'#637952');rect(x+11,y-61,16,3,'#5b6842');rect(x+12,y-43,14,3,'#55603a');
  glow(x+19,y-51,active?105:30,active?'#e8c775':'#99bd7a',active?.9:.35);
  if(active&&Math.sin(elapsed*5)>.8)particles.push({x:cp.x+19,y:y-47,vx:(Math.random()-.5)*15,vy:-18,life:1.3,max:1.3,size:1.3,color:'#e8df9f',g:-5});
}
function drawGate(){
  const x=gate.x-camera,y=gate.y,active=score>=REQUIRED;
  if(x<-100||x>W+100)return;
  rect(x-62,y-9,124,9,'#506247');rect(x-50,y-17,100,8,'#728063');
  rect(x-46,y-115,18,100,'#4a6251');rect(x+28,y-115,18,100,'#4a6251');
  rect(x-42,y-127,84,16,'#5a7157');rect(x-31,y-137,62,12,'#6d8060');rect(x-18,y-145,36,8,'#8b9970');
  for(let i=0;i<5;i++){rect(x-44,y-111+i*19,14,2,'#849072');rect(x+30,y-111+i*19,14,2,'#849072');}
  if(active){
    glow(x,y-75,130,'#b1e68e',1.2);
    const g=ctx.createLinearGradient(x,y-120,x,y-18);g.addColorStop(0,'#c6f3b226');g.addColorStop(.6,'#b8ed9a77');g.addColorStop(1,'#e2ffb8bb');ctx.fillStyle=g;ctx.fillRect(x-27,y-112,54,94);
    for(let i=0;i<20;i++){const py=y-20-((i*9+elapsed*25)%95);rect(x-22+(i*17%44),py,2,3,'#d8f9b4');}
  }
  for(let i=0;i<3;i++){const color=active?'#d8f8b5':'#718b64';rect(x-3,y-130+i*5,6-i*2,2,color);}
}
function drawEnemy(e){
  if(e.health<=0)return;const x=Math.floor(e.x-camera),y=Math.floor(e.y+Math.sin(elapsed*4+e.min)*2);
  if(x<-40||x>W+40)return;
  const c=e.hit>0?'#d5e9d1':'#4c4563';
  rect(x+5,y,15,4,c);rect(x+2,y+4,21,16,c);rect(x,y+10,25,10,c);rect(x+3,y+20,5,5,c);rect(x+10,y+20,5,3,c);rect(x+18,y+20,4,5,c);
  rect(x+3,y+5,18,4,e.hit>0?'#f1f8e3':'#615475');rect(x+6,y+10,4,3,'#e5adbe');rect(x+16,y+10,4,3,'#e5adbe');
  glow(x+12,y+11,35,'#c77cab',.24);
  if(e.health===1){rect(x+4,y-8,18,2,'#36453b');rect(x+4,y-8,9,2,'#d6a8b0');}
}
function drawPlayer(px=player.x,py=player.y,alpha=1,ghost=false){
  const x=Math.round(px-camera),y=Math.round(py),face=player.face;
  if(!ghost&&player.inv>0&&Math.floor(elapsed*14)%2===0)return;
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(x+9,y);ctx.scale(face,1);
  const walk=player.grounded?Math.sin(player.step)*3:2,cape=Math.sin(elapsed*7)*2;
  // Fluttering moss-green cape, pale hood, tiny leather boots.
  rect(-11,13,15,14,'#527b63');rect(-13+cape,19,6,10,'#426b59');rect(-15+cape,25,8,4,'#3a5c4c');
  rect(-6,13,13,14,'#97b59b');rect(-5,16,10,9,'#bdc7a1');rect(-7,22,15,5,'#6b8566');
  rect(-5,27,5,4+walk,'#354a3b');rect(3,27,5,4-walk,'#354a3b');rect(-6,30+walk,6,3,'#bdc09a');rect(3,30-walk,7,3,'#bdc09a');
  rect(-7,1,15,4,'#c6d2a7');rect(-10,5,20,11,'#bdcba5');rect(-8,3,17,3,'#dde3bb');rect(-8,15,14,3,'#8fa68b');
  rect(1,7,10,8,'#384c41');rect(8,9,2,3,'#f1e9b1');rect(-11,8,3,5,'#9aaf8f');
  rect(-6,15,15,3,'#d6c58a');rect(-11,17,8,3,'#b1a678');rect(-14+cape,19,6,3,'#d0bd7c');
  rect(7,17,5,7,'#d0c49d');rect(11,20,4,2,'#516748');
  // The traveler's lantern.
  rect(14,18,1,5,'#d6d199');rect(12,23,6,7,'#7d8760');rect(13,24,4,4,'#f7e9ac');rect(11,22,8,2,'#b5b786');
  ctx.restore();
  if(!ghost){
    glow(x+9+face*15,y+26,85,'#e4d291',.9);
    if(player.attack>0){
      ctx.save();ctx.translate(x+9,y+16);ctx.scale(face,1);
      ctx.strokeStyle='#eaffcf';ctx.lineWidth=3;ctx.beginPath();const a=1-player.attack/.24;ctx.arc(4,0,36,-1.5+a*.8,1.25+a*.6);ctx.stroke();
      ctx.strokeStyle='#b9e5af66';ctx.lineWidth=8;ctx.beginPath();ctx.arc(4,0,42,-1.3+a*.8,1.1+a*.6);ctx.stroke();ctx.restore();
      glow(x+9+face*30,y+16,65,'#dbf4bd',.8);
    }
  }
}
function drawForeground(){
  // Close silhouettes frame the scene like a little diorama.
  const edge=-camera*.9;
  if(edge>-150){
    rect(edge+17,0,26,540,'#081b19');rect(edge+31,0,18,260,'#0b221e');rect(edge+7,350,14,190,'#0a1d19');
    for(let i=0;i<6;i++){rect(edge+30+i*10,80+i*6,20,7,'#0b211c');rect(edge+42+i*10,70+i*5,15,8,'#0d251e');}
  }
  const r=random(901);
  for(let i=0;i<30;i++){
    const x=(i*47-camera*.93%(W+120))-35,y=H-8+r()*8,h=15+r()*40;
    rect(x,y-h,3,h,'#0b201a');rect(x-5,y-h+6,12,5,'#102b21');rect(x-9,y-h+16,19,5,'#102b21');rect(x-12,y-h+26,25,5,'#0e261d');
  }
  const mist=ctx.createLinearGradient(0,450,0,H);mist.addColorStop(0,'#81b7a000');mist.addColorStop(1,'#8cb5a016');ctx.fillStyle=mist;ctx.fillRect(0,450,W,90);
}
function render(){
  ctx.imageSmoothingEnabled=false;light.clearRect(0,0,W/2,H/2);ctx.save();
  if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
  drawMountains();
  trees[0].forEach(t=>drawTree(t,0));
  // Thin luminous fog separating background layers.
  const fog=ctx.createLinearGradient(0,260,0,450);fog.addColorStop(0,'#8ab59a00');fog.addColorStop(.6,'#96c8ac0c');fog.addColorStop(1,'#8ab59a00');ctx.fillStyle=fog;ctx.fillRect(0,260,W,190);
  trees[1].forEach(t=>drawTree(t,1));
  drawTerrain();checkpoints.forEach(drawLantern);drawGate();
  crystals.forEach(drawCrystal);enemies.forEach(drawEnemy);
  for(const e of echoes)drawPlayer(e.x,e.y,e.life/.22*.35,true);
  drawPlayer();
  for(const f of flies){
    const x=f.x-camera*.85+Math.sin(elapsed*.6+f.p)*18,y=f.y+Math.cos(elapsed*.7+f.p)*10;
    if(x<-20||x>W+20)continue;
    const alpha=.35+Math.sin(elapsed*1.3+f.p)**2*.65;
    ctx.globalAlpha=alpha;rect(x,y,f.s,f.s,'#dbebb1');ctx.globalAlpha=1;glow(x,y,18,'#c8e987',alpha*.4);
  }
  for(const p of particles){ctx.globalAlpha=Math.min(1,p.life/p.max);rect(p.x-camera,p.y,p.size,p.size,p.color);ctx.globalAlpha=1;}
  drawForeground();
  ctx.save();ctx.globalCompositeOperation='screen';ctx.imageSmoothingEnabled=true;ctx.drawImage(lightCanvas,0,0,W,H);ctx.restore();
  // Gentle film texture, no external assets or filters.
  ctx.globalAlpha=.028;for(let y=0;y<H;y+=3)rect(0,y,W,1,'#000000');ctx.globalAlpha=1;
  ctx.restore();
}
function frame(time){
  const dt=Math.min((time-lastTime)/1000||0,1/30);lastTime=time;
  update(dt);render();requestAnimationFrame(frame);
}

const keyMap={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'jump',KeyW:'jump',ArrowUp:'jump',KeyJ:'attack',KeyK:'dash',ShiftLeft:'dash',ShiftRight:'dash'};
document.addEventListener('keydown',e=>{
  // Keep keyboard navigation and button activation native while a dialog is open.
  if(!$('modal').hidden){
    if(e.code==='Escape'&&(modalKind==='pause'||modalKind==='help')){e.preventDefault();closeModal();}
    if(e.code==='Tab'){
      const focusable=[...$('modal').querySelectorAll('button:not([hidden])')];
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
    return;
  }
  if(e.code==='Enter'&&mode==='intro'&&document.activeElement?.tagName!=='BUTTON'){e.preventDefault();start();return;}
  if(e.code==='Escape'&&mode==='playing'){e.preventDefault();openModal('pause');return;}
  const action=keyMap[e.code];
  if(!action||mode!=='playing'||document.activeElement?.tagName==='BUTTON')return;
  e.preventDefault();if(e.repeat)return;keys.add(action);
  if(action==='jump')jump();if(action==='attack')attack();if(action==='dash')dash();
});
document.addEventListener('keyup',e=>{const action=keyMap[e.code];if(action)keys.delete(action);});
window.addEventListener('blur',()=>{keys.clear();if(mode==='playing')openModal('pause');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')openModal('pause');});
$('start-button').addEventListener('click',start);
$('help-button').addEventListener('click',()=>{if(!$('modal').hidden)return;openModal('help');});
$('pause-button').addEventListener('click',()=>{if(mode==='playing'||(mode==='paused'&&modalKind==='pause'))openModal('pause');});
$('pause-button').disabled=true;
$('sound-button').addEventListener('click',()=>{void setSound(!soundEnabled);if(mode==='playing')canvas.focus({preventScroll:true});});
$('fullscreen-button').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game-frame').requestFullscreen();}
  catch{toast('当前浏览器不支持全屏，可使用横屏游玩。');}
  if(mode==='playing')canvas.focus({preventScroll:true});
});
document.addEventListener('fullscreenchange',()=>{$('fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏游戏');});
$('fullscreen-exit').addEventListener('click',async()=>{
  if(document.fullscreenElement)await document.exitFullscreen();
  if(mode==='playing')canvas.focus({preventScroll:true});
});
$('modal-primary').addEventListener('click',()=>{
  if(modalKind==='won')start();else if(modalKind==='dead')respawn();else closeModal();
});
$('restart-button').addEventListener('click',start);
document.querySelectorAll('[data-control]').forEach(button=>{
  const action=button.dataset.control;
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();if(mode!=='playing')return;button.setPointerCapture(e.pointerId);keys.add(action);button.classList.add('active');
    if(action==='jump')jump();if(action==='attack')attack();if(action==='dash')dash();
  });
  const release=()=>{keys.delete(action);button.classList.remove('active');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  button.addEventListener('contextmenu',e=>e.preventDefault());
});

// Read-only state for browser-based smoke tests. No gameplay shortcuts.
if(new URLSearchParams(location.search).has('test'))Object.defineProperty(window,'gameState',{get:()=>({mode,score,kills,checkpoint,gameTime,camera,player:{...player},crystals:crystals.map(c=>({...c})),enemies:enemies.map(e=>({...e})),platforms})});
reset();requestAnimationFrame(frame);
