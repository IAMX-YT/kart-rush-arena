import React, {useEffect, useRef, useState} from 'react';
import {neutral, type Input} from '../shared/types';

export function KartTouchControls({onInput}: {onInput:(input:Input)=>void}) {
  const pointers=useRef(new Map<number,keyof Input>());
  const callback=useRef(onInput);callback.current=onInput;
  const [held,setHeld]=useState<Input>(neutral());
  const publish=()=>{const input=neutral();for(const key of pointers.current.values())input[key]=true;setHeld(input);callback.current(input);};
  useEffect(()=>{const reset=()=>{pointers.current.clear();setHeld(neutral());callback.current(neutral());};const visibility=()=>{if(document.hidden)reset();};window.addEventListener('blur',reset);document.addEventListener('visibilitychange',visibility);return()=>{window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);callback.current(neutral());};},[]);
  return <div className="kart-touch-controls" aria-label="Controls on this screen">
    {(['left','right','brake','gas','drift','item','respawn'] as const).map(key=><button type="button" key={key} className={`kart-touch-button ${key} ${held[key]?'held':''}`} aria-label={key==='gas'?'Accelerate':key} aria-pressed={held[key]}
      onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,key);publish();}}
      onPointerUp={e=>{pointers.current.delete(e.pointerId);publish();}}
      onPointerCancel={e=>{pointers.current.delete(e.pointerId);publish();}}
      onLostPointerCapture={e=>{if(pointers.current.delete(e.pointerId))publish();}}>{key==='gas'?'ACCELERATE':key.toUpperCase()}</button>)}
  </div>;
}
