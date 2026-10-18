const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/text-BvvpXp9t.js","assets/build-DwX4NwD5.js","assets/pack-BO5CzhCb.js","assets/build-DDsmfzc4.css","assets/main-CPd1Xft4.js","assets/storage-CGNtKIsN.js","assets/App-CROoy4a8.js","assets/jsxRuntime.module-CJCcLAC_.js","assets/hooks.module-DoPG754J.js","assets/utils-D1okDBUh.js","assets/editor-Cj6xW_7B.css"])))=>i.map(i=>d[i]);
import{u as f}from"./jsxRuntime.module-CJCcLAC_.js";const P="modulepreload",E=function(c){return"/"+c},p={},i=function(d,a,g){let l=Promise.resolve();if(a&&a.length>0){let m=function(e){return Promise.all(e.map(r=>Promise.resolve(r).then(s=>({status:"fulfilled",value:s}),s=>({status:"rejected",reason:s}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),t=o?.nonce||o?.getAttribute("nonce");l=m(a.map(e=>{if(e=E(e),e in p)return;p[e]=!0;const r=e.endsWith(".css"),s=r?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${e}"]${s}`))return;const n=document.createElement("link");if(n.rel=r?"stylesheet":P,r||(n.as="script"),n.crossOrigin="",n.href=e,t&&n.setAttribute("nonce",t),document.head.appendChild(n),r)return new Promise((h,_)=>{n.addEventListener("load",h),n.addEventListener("error",()=>_(new Error(`Unable to preload CSS for ${e}`)))})}))}function u(o){const t=new Event("vite:preloadError",{cancelable:!0});if(t.payload=o,window.dispatchEvent(t),!t.defaultPrevented)throw o}return l.then(o=>{for(const t of o||[])t.status==="rejected"&&u(t.reason);return d().catch(u)})};async function b(){if(location.hash.startsWith("#text=")){document.title="PageParcel Page Text",document.body.innerHTML=`
      <main>
        <p class="eyebrow">PAGEPARCEL</p>
        <h1>Page Text</h1>
        <p id="details" class="details"></p>
        <p id="status" role="status">Preparing Markdown…</p>
        <button id="download" type="button" disabled>Download Markdown</button>
        <p class="privacy">Loaded page text only. No scrolling, screenshots, or OCR. Hidden content, form fields, editable areas, and embedded content are excluded. Nothing is uploaded.</p>
      </main>`,await i(()=>import("./text-BvvpXp9t.js"),__vite__mapDeps([0,1,2,3]));return}if(location.hash==="#pack"){document.title="PageParcel Trace Bundle",document.body.innerHTML=`
      <main>
        <p class="eyebrow">PAGEPARCEL</p>
        <h1>Your page is being packed.</h1>
        <p id="details" class="details"></p>
        <p id="status" role="status">Loading capture…</p>
        <button id="download" type="button" disabled>Download again</button>
        <p class="privacy">The screenshot, page text, metadata, hashes, and ZIP are created on this Mac. No capture content is sent to a server.</p>
      </main>`,await i(()=>import("./main-CPd1Xft4.js"),__vite__mapDeps([4,1,2,3,5]));return}const[{render:c},{App:d}]=await Promise.all([i(()=>import("./jsxRuntime.module-CJCcLAC_.js").then(a=>a.p),[]),i(()=>import("./App-CROoy4a8.js"),__vite__mapDeps([6,7,8,5,9]))]);await i(()=>Promise.resolve({}),__vite__mapDeps([10])),c(f(d,{}),document.getElementById("app"))}b();
