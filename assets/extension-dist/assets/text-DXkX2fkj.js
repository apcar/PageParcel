import{_ as u}from"./index.html-CqBxGrlG.js";import{b as g}from"./build-BLLAjDKV.js";import"./jsxRuntime.module-CJCcLAC_.js";import"./pack-BO5CzhCb.js";function w(e){const r=[`
## OCR from visible graphics
`,`> Local English OCR of readable images/canvases intersecting the viewport. Recognition can be wrong and duplicate page text. No screenshots, map/chart interpretation, SVG, CSS backgrounds, frames, or shadow DOM. Cross-origin restrictions can prevent recognition.
`];e.omitted&&r.push(`> ${e.omitted} candidate graphic(s) skipped because of browser restrictions, coverage, or capture limits.
`),e.error&&r.push(`> ${e.error}
`),e.results?.length||r.push(`No OCR text was obtained.
`);for(const[s,t]of(e.results||[]).entries()){r.push(`### Graphic ${s+1}
`);const a=`${t.label}
OCR confidence: ${Math.round(t.confidence)} / 100 (not a guarantee)
${t.text||"[No text recognized]"}`,o="`".repeat(Math.max(3,...Array.from(a.matchAll(/`+/g),i=>i[0].length+1)));r.push(`${o}text
${a}
${o}
`)}return r.join(`
`)}async function p(){const e=document.querySelector("#status"),r=document.querySelector("#details"),s=document.querySelector("#download"),t=decodeURIComponent(location.hash.slice(6));if(!/^pageparcel:text:[a-f0-9-]+$/.test(t)){e.textContent="Invalid Page Text capture.";return}try{const o={...await chrome.storage.local.get(t),...await chrome.storage.session.get(t)}[t];if(!o)throw new Error("No pending page text. Start a new capture from PageParcel.");if(await Promise.all([chrome.storage.local.remove(t),chrome.storage.session.remove(t)]),o.ocr){const{recognizeImages:h}=await u(async()=>{const{recognizeImages:d}=await import("./recognize-CT8aj4eA.js");return{recognizeImages:d}},[]);await h(o.ocr,d=>{e.textContent=d})}const i=o.ocr?w(o.ocr):"",l=document.querySelector("#include-navigation");let n=g(o);n.markdown+=i;let c=URL.createObjectURL(new Blob([n.markdown],{type:"text/markdown;charset=utf-8"}));l.addEventListener("change",()=>{n=g(o,l.checked),n.markdown+=i,URL.revokeObjectURL(c),c=URL.createObjectURL(new Blob([n.markdown],{type:"text/markdown;charset=utf-8"})),e.textContent="Options changed. Download Markdown to save this version."}),window.addEventListener("pagehide",()=>URL.revokeObjectURL(c),{once:!0}),s.disabled=!1;const m=async()=>{try{await chrome.downloads.download({url:c,filename:n.filename}),e.textContent=o.truncated?"Download started. Capture limit reached: text may be incomplete; see the file notice.":"Markdown download started. Nothing was uploaded."}catch{e.textContent="Download could not start. Use Download Markdown to try again."}};s.addEventListener("click",()=>{m()}),r.textContent=`${o.title}
${o.url}`,await Promise.all([chrome.storage.local.remove(t),chrome.storage.session.remove(t)]),await m()}catch(a){e.textContent=a instanceof Error?a.message:"Could not prepare Page Text.",e.dataset.error="true",await Promise.all([chrome.storage.local.remove(t),chrome.storage.session.remove(t)])}}p();
