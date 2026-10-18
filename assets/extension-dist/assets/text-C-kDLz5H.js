import{_ as f}from"./index.html-Bo3SDKwH.js";import{b as u}from"./build-CG1yoIX2.js";import"./jsxRuntime.module-CJCcLAC_.js";import"./pack-BO5CzhCb.js";function v(e){const o=[`
## OCR from visible graphics
`,`> Local English OCR of readable images/canvases intersecting the viewport. Recognition can be wrong and duplicate page text. No screenshots, map/chart interpretation, SVG, CSS backgrounds, frames, or shadow DOM. Cross-origin restrictions can prevent recognition.
`];e.omitted&&o.push(`> ${e.omitted} candidate graphic(s) skipped.
`);const r={covered:"Covered by another page element at the visibility check point.","image-limit":"Eight-image limit reached.","not-loaded":"Image or canvas has no readable pixel dimensions yet.","pixel-limit":"Four-million-pixel processing limit reached.","browser-security":"Browser security blocked pixel access (usually a cross-origin image or tainted canvas).","canvas-unavailable":"Local canvas context unavailable.","read-failed":"Pixel read failed; the browser did not provide a more specific reason."};for(const[n,t]of(e.skipped||[]).entries())o.push(`### Skipped graphic ${n+1}

${r[t.reason]}
`),o.push(p(t.label));const a=e.omitted-(e.skipped?.length||0);a>0&&o.push(`> ${a} further skip reason(s) unavailable or omitted from the bounded diagnostic list.
`),e.error&&o.push(`> ${e.error}
`),e.results?.length||o.push(`No OCR text was obtained.
`);for(const[n,t]of(e.results||[]).entries()){o.push(`### Graphic ${n+1}
`);const s=`${t.label}
OCR confidence: ${Math.round(t.confidence)} / 100 (not a guarantee)
${t.text||"[No text recognized]"}`;o.push(p(s))}return o.join(`
`)}function p(e){const o="`".repeat(Math.max(3,...Array.from(e.matchAll(/`+/g),r=>r[0].length+1)));return`${o}text
${e}
${o}
`}async function x(){const e=document.querySelector("#status"),o=document.querySelector("#details"),r=document.querySelector("#download"),a=decodeURIComponent(location.hash.slice(6));if(!/^pageparcel:text:[a-f0-9-]+$/.test(a)){e.textContent="Invalid Page Text capture.";return}try{const t={...await chrome.storage.local.get(a),...await chrome.storage.session.get(a)}[a];if(!t)throw new Error("No pending page text. Start a new capture from PageParcel.");if(await Promise.all([chrome.storage.local.remove(a),chrome.storage.session.remove(a)]),t.ocr){const{recognizeImages:w}=await f(async()=>{const{recognizeImages:d}=await import("./recognize-CT8aj4eA.js");return{recognizeImages:d}},[]);await w(t.ocr,d=>{e.textContent=d})}const s=t.ocr?v(t.ocr):"",l=document.querySelector("#include-navigation"),m=document.querySelector("#include-presentation-copies");let i=u(t);i.markdown+=s;let c=URL.createObjectURL(new Blob([i.markdown],{type:"text/markdown;charset=utf-8"}));const h=()=>{i=u(t,l.checked,m.checked),i.markdown+=s,URL.revokeObjectURL(c),c=URL.createObjectURL(new Blob([i.markdown],{type:"text/markdown;charset=utf-8"})),e.textContent="Options changed. Download Markdown to save this version."};l.addEventListener("change",h),m.addEventListener("change",h),window.addEventListener("pagehide",()=>URL.revokeObjectURL(c),{once:!0}),r.disabled=!1;const g=async()=>{try{await chrome.downloads.download({url:c,filename:i.filename}),e.textContent=t.truncated?"Download started. Capture limit reached: text may be incomplete; see the file notice.":"Markdown download started. Nothing was uploaded."}catch{e.textContent="Download could not start. Use Download Markdown to try again."}};r.addEventListener("click",()=>{g()}),o.textContent=`${t.title}
${t.url}`,await Promise.all([chrome.storage.local.remove(a),chrome.storage.session.remove(a)]),await g()}catch(n){e.textContent=n instanceof Error?n.message:"Could not prepare Page Text.",e.dataset.error="true",await Promise.all([chrome.storage.local.remove(a),chrome.storage.session.remove(a)])}}x();
