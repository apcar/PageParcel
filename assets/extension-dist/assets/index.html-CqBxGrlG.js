const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/text-DXkX2fkj.js","assets/build-BLLAjDKV.js","assets/pack-BO5CzhCb.js","assets/build-DDsmfzc4.css","assets/jsxRuntime.module-CJCcLAC_.js","assets/main-BZcSBr-8.js","assets/storage-CGNtKIsN.js","assets/App-CROoy4a8.js","assets/hooks.module-DoPG754J.js","assets/utils-D1okDBUh.js","assets/editor-Cj6xW_7B.css"])))=>i.map(i=>d[i]);
import{u as f}from"./jsxRuntime.module-CJCcLAC_.js";const P="modulepreload",b=function(l){return"/"+l},p={},s=function(c,r,g){let d=Promise.resolve();if(r&&r.length>0){let m=function(e){return Promise.all(e.map(a=>Promise.resolve(a).then(i=>({status:"fulfilled",value:i}),i=>({status:"rejected",reason:i}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),t=o?.nonce||o?.getAttribute("nonce");d=m(r.map(e=>{if(e=b(e),e in p)return;p[e]=!0;const a=e.endsWith(".css"),i=a?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${e}"]${i}`))return;const n=document.createElement("link");if(n.rel=a?"stylesheet":P,a||(n.as="script"),n.crossOrigin="",n.href=e,t&&n.setAttribute("nonce",t),document.head.appendChild(n),a)return new Promise((h,_)=>{n.addEventListener("load",h),n.addEventListener("error",()=>_(new Error(`Unable to preload CSS for ${e}`)))})}))}function u(o){const t=new Event("vite:preloadError",{cancelable:!0});if(t.payload=o,window.dispatchEvent(t),!t.defaultPrevented)throw o}return d.then(o=>{for(const t of o||[])t.status==="rejected"&&u(t.reason);return c().catch(u)})};async function E(){if(location.hash.startsWith("#text=")){document.title="PageParcel Page Text",document.body.innerHTML=`
      <main>
        <p class="eyebrow">PAGEPARCEL</p>
        <h1>Page Text</h1>
        <label><input id="include-navigation" type="checkbox"> Include site navigation</label>
        <p id="details" class="details"></p>
        <p id="status" role="status">Preparing Markdown…</p>
        <button id="download" type="button" disabled>Download Markdown</button>
        <p class="privacy">Loaded page text only. No scrolling. Optional OCR reads visible image regions locally; OCR may be inaccurate. Hidden content, form fields, editable areas, and embedded content are excluded. Nothing is uploaded.</p>
      </main>`,await s(()=>import("./text-DXkX2fkj.js"),__vite__mapDeps([0,1,2,3,4]));return}if(location.hash==="#pack"){document.title="PageParcel Trace Bundle",document.body.innerHTML=`
      <main>
        <p class="eyebrow">PAGEPARCEL</p>
        <h1>Your page is being packed.</h1>
        <p id="details" class="details"></p>
        <p id="status" role="status">Loading capture…</p>
        <button id="download" type="button" disabled>Download again</button>
        <p class="privacy">The screenshot, page text, metadata, hashes, and ZIP are created on this Mac. No capture content is sent to a server.</p>
      </main>`,await s(()=>import("./main-BZcSBr-8.js"),__vite__mapDeps([5,1,2,3,6]));return}const[{render:l},{App:c}]=await Promise.all([s(()=>import("./jsxRuntime.module-CJCcLAC_.js").then(r=>r.p),[]),s(()=>import("./App-CROoy4a8.js"),__vite__mapDeps([7,4,8,6,9]))]);await s(()=>Promise.resolve({}),__vite__mapDeps([10])),l(f(c,{}),document.getElementById("app"))}E();export{s as _};
