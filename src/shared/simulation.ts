import {type Input,type Kart,type Race,type Player,neutral} from './types';
export const TAU=Math.PI*2, RX=48,RZ=32,WIDTH=12,LAPS=3,GATES=12;
export const wrap=(n:number)=>(n%TAU+TAU)%TAU;
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function trackPoint(t:number){return {x:RX*Math.cos(t),z:RZ*Math.sin(t),heading:Math.atan2(-RX*Math.sin(t),RZ*Math.cos(t))};}
export function nearest(x:number,z:number){let t=Math.atan2(z/RZ,x/RX);for(let i=0;i<5;i++){const sx=RX*Math.cos(t),sz=RZ*Math.sin(t),dx=-RX*Math.sin(t),dz=RZ*Math.cos(t);const den=dx*dx+dz*dz+(sx-x)*-RX*Math.cos(t)+(sz-z)*-RZ*Math.sin(t);t-=Math.max(-.2,Math.min(.2,((sx-x)*dx+(sz-z)*dz)/(den||1)));}const p=trackPoint(t);return {...p,theta:wrap(t),distance:Math.hypot(x-p.x,z-p.z)};}
export function createRace(players:Player[]):Race{return {phase:'countdown',time:0,countdown:3,karts:players.map((p,i)=>{const t=-.07*Math.floor(i/2),a=trackPoint(t),offset=(i%2?1:-1)*2;return {...p,x:a.x+Math.cos(t)*offset,z:a.z+Math.sin(t)*offset,heading:a.heading,speed:0,vx:0,vz:0,lap:0,next:1,progress:0,finished:null,item:null,boost:0,shield:0,slow:0,respawnAt:0,itemHeld:false,respawnHeld:false,impact:0};}),pickups:[.7,2.4,3.8,5.3].map(theta=>({theta,availableAt:0})),finishOrder:[]};}
export function respawn(r:Race,k:Kart){if(r.time<k.respawnAt)return;const a=trackPoint(((k.next+GATES-1)%GATES)/GATES*TAU);k.x=a.x;k.z=a.z;k.heading=a.heading;k.vx=k.vz=k.speed=0;k.respawnAt=r.time+3;}
export function useItem(r:Race,k:Kart){if(!k.item)return;const item=k.item;k.item=null;if(item==='boost')k.boost=2;if(item==='shield')k.shield=5;if(item==='pulse')for(const other of r.karts){if(other.id!==k.id&&!other.shield&&Math.hypot(other.x-k.x,other.z-k.z)<20){other.slow=2;other.impact=1;}}}
export function advanceCheckpoint(k:Kart,before:number,after:number){const delta=angleDelta(after,before),target=k.next/GATES*TAU;const d=wrap(target-before);if(delta>0&&delta<.25&&d<=delta+.00001){if(k.next===0)k.lap++;k.next=(k.next+1)%GATES;}k.progress=k.lap*GATES+((k.next+GATES-1)%GATES)+angleDelta(after,((k.next+GATES-1)%GATES)/GATES*TAU)/(TAU/GATES);}
export function ranking(r:Race){return [...r.karts].sort((a,b)=>a.finished!==null?(b.finished!==null?a.finished-b.finished:-1):b.finished!==null?1:b.progress-a.progress);}
export function step(r:Race,inputs:Map<string,Input>,dt:number){if(r.phase==='results'||r.phase==='paused')return;if(r.phase==='countdown'){r.countdown=Math.max(0,r.countdown-dt);if(r.countdown<=0)r.phase='racing';return;}r.time+=dt;
 for(const k of r.karts){k.impact=Math.max(0,k.impact-dt*2);k.boost=Math.max(0,k.boost-dt);k.shield=Math.max(0,k.shield-dt);k.slow=Math.max(0,k.slow-dt);if(k.finished!==null)continue;const u=k.connected?(inputs.get(k.id)||neutral()):neutral();if(u.respawn&&!k.respawnHeld)respawn(r,k);k.respawnHeld=u.respawn;if(u.item&&!k.itemHeld)useItem(r,k);k.itemHeld=u.item;
 const before=nearest(k.x,k.z).theta;const acceleration=u.gas?20:u.brake?(k.speed>1?-36:-10):0;k.speed+=acceleration*dt;k.speed*=Math.exp(-((u.gas||u.brake)? .25 : 1.3)*dt);const max=k.boost?38:k.slow?12:26;k.speed=Math.max(-9,Math.min(max,k.speed));const steer=(Number(u.left)-Number(u.right));k.heading+=steer*(u.drift?2.1:1.5)*Math.min(1,Math.max((u.gas||u.brake)? .35 : 0,Math.abs(k.speed)/7))*(k.speed<0?-1:1)*dt;
 const traction=u.drift?3:12,mix=1-Math.exp(-traction*dt);k.vx+=(Math.sin(k.heading)*k.speed-k.vx)*mix;k.vz+=(Math.cos(k.heading)*k.speed-k.vz)*mix;k.x+=k.vx*dt;k.z+=k.vz*dt;
 const n=nearest(k.x,k.z);if(n.distance>WIDTH/2-.9){const nx=(k.x-n.x)/n.distance,nz=(k.z-n.z)/n.distance;k.x=n.x+nx*(WIDTH/2-.9);k.z=n.z+nz*(WIDTH/2-.9);const v=k.vx*nx+k.vz*nz;if(v>0){k.vx-=1.4*v*nx;k.vz-=1.4*v*nz;k.speed*=.65;k.impact=1;}}
 if(!Number.isFinite(k.x)||Math.hypot(k.x,k.z)>150)respawn(r,k);
 advanceCheckpoint(k,before,nearest(k.x,k.z).theta);if(k.lap>=LAPS){k.finished=r.time;r.finishOrder.push(k.id);k.speed=k.vx=k.vz=0;}
 for(let i=0;i<r.pickups.length;i++){const box=r.pickups[i],p=trackPoint(box.theta);if(!k.item&&r.time>=box.availableAt&&Math.hypot(k.x-p.x,k.z-p.z)<3.2){k.item=(['boost','shield','pulse'] as const)[(Math.floor(r.time)+i)%3];box.availableAt=r.time+5;}}
 }
 const beforeCollision=new Map(r.karts.map(k=>[k.id,nearest(k.x,k.z).theta]));for(let i=0;i<r.karts.length;i++)for(let j=i+1;j<r.karts.length;j++){const a=r.karts[i],b=r.karts[j];if(a.finished!==null||b.finished!==null)continue;let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<2){if(d<.001){dx=.0001;dz=0;d=.0001;}const push=(2-d)/2,nx=dx/d,nz=dz/d;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;a.speed*=.92;b.speed*=.92;a.impact=b.impact=1;}}
 for(const k of r.karts){if(k.finished!==null)continue;const n=nearest(k.x,k.z);if(n.distance>WIDTH/2-.9){const scale=(WIDTH/2-.9)/n.distance;k.x=n.x+(k.x-n.x)*scale;k.z=n.z+(k.z-n.z)*scale;}advanceCheckpoint(k,beforeCollision.get(k.id)!,nearest(k.x,k.z).theta);if(k.lap>=LAPS){k.finished=r.time;r.finishOrder.push(k.id);k.speed=k.vx=k.vz=0;}}
 if(r.karts.every(k=>k.finished!==null||(!k.connected&&r.time-(k.disconnectedAt??r.time)>15))||r.time>=300)r.phase='results';
}
export interface GamePlugin{start(players:Player[]):Race;update(r:Race,inputs:Map<string,Input>,dt:number):void;pause(r:Race):void;end(r:Race):void;disconnect(r:Race,id:string):void;cleanup(r:Race):void}
export const kartPlugin:GamePlugin={start:createRace,update:step,pause(r){if(r.phase==='paused'){r.phase=r.pausedFrom||'racing';}else if(r.phase==='racing'||r.phase==='countdown'){r.pausedFrom=r.phase;r.phase='paused';}},end(r){r.phase='results';},disconnect(r,id){const k=r.karts.find(k=>k.id===id);if(k){k.connected=false;k.disconnectedAt=r.time;k.speed=k.vx=k.vz=0;}},cleanup(r){r.karts.length=0;r.pickups.length=0;}};






