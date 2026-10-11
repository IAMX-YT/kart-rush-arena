import * as THREE from 'three';

export function detailedTree(x:number,z:number,high:boolean):THREE.Group {
  const group=new THREE.Group();group.position.set(x,0,z);
  const bark=new THREE.MeshStandardMaterial({color:'#685445',roughness:1});
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.10,.28,3.7,10),bark);trunk.position.y=1.85;trunk.castShadow=true;group.add(trunk);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d')!;
  const gradient=ctx.createLinearGradient(0,0,0,64);gradient.addColorStop(0,'#6d8e39');gradient.addColorStop(.5,'#48692b');gradient.addColorStop(1,'#234226');
  ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(3,32);ctx.bezierCurveTo(35,0,92,0,124,32);ctx.bezierCurveTo(89,62,38,62,3,32);ctx.fill();ctx.strokeStyle='#a9b76b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(4,32);ctx.lineTo(121,32);ctx.stroke();
  const leafTexture=new THREE.CanvasTexture(canvas);leafTexture.colorSpace=THREE.SRGBColorSpace;
  const leafMat=new THREE.MeshStandardMaterial({map:leafTexture,alphaTest:.45,side:THREE.DoubleSide,roughness:.9});
  const count=high?900:300;const leaves=new THREE.InstancedMesh(new THREE.PlaneGeometry(.50,.25),leafMat,count);const dummy=new THREE.Object3D();
  let seed=Math.abs(Math.round(x*971+z*577))+1;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++){const angle=random()*Math.PI*2;const radius=Math.sqrt(random())*2.2;dummy.position.set(Math.cos(angle)*radius,3.4+random()*2.3,Math.sin(angle)*radius);dummy.rotation.set(random()*Math.PI,random()*Math.PI,random()*Math.PI);dummy.scale.setScalar(.6+random()*.9);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);leaves.setColorAt(i,new THREE.Color().setHSL(.22+random()*.05,.32,.44+random()*.15));}
  leaves.castShadow=high;leaves.receiveShadow=true;group.add(leaves);
  for(let i=0;i<7;i++){const a=i*Math.PI*.7;const start=new THREE.Vector3(0,1.9+i*.17,0);const end=new THREE.Vector3(Math.sin(a)*1.5,3.9+i*.13,Math.cos(a)*1.5);const delta=end.clone().sub(start);const branch=new THREE.Mesh(new THREE.CylinderGeometry(.025,.095,delta.length(),7),bark);branch.position.copy(start.clone().add(end).multiplyScalar(.5));branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());branch.castShadow=true;group.add(branch);}
  return group;
}
