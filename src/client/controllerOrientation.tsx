import React from 'react';

export async function controllerFullscreen() {
  try {if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();}catch{}
  try {await (screen.orientation as ScreenOrientation & {lock?:(value:string)=>Promise<void>}).lock?.('landscape');}catch{}
}

export function ControllerOrientation() {
  return <aside className="remote-rotate-gate" aria-label="Landscape controller required">
    <div className="rotate-phone-icon" aria-hidden="true">↻</div>
    <h1>Turn your phone sideways.</h1>
    <p>This controller works in landscape.<br/>Keep your game on the big screen.</p>
    <button className="primary" onClick={controllerFullscreen}>Enter fullscreen</button>
  </aside>;
}
