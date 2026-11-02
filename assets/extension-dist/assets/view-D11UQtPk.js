function d(){return`<main>
    <p class="eyebrow">PAGEPARCEL</p>
    <h1>Page Text</h1>
    <p id="details" class="details"></p>
    <p id="status" role="status">Preparing Markdown…</p>
    <button id="download" type="button" disabled>Download Markdown</button>
    <details class="advanced">
      <summary>Advanced</summary>
      <label><input id="include-navigation" type="checkbox"> Include site navigation</label>
      <label id="duplicate-option" hidden><input id="include-presentation-copies" type="checkbox" disabled> Keep duplicate page copies</label>
    </details>
    <p class="privacy">Loaded page text only. No scrolling. Hidden content, form fields, editable areas, and embedded content are excluded. Nothing is uploaded.</p>
  </main>`}function n(e,a=document){const i=a.querySelector("#duplicate-option"),t=a.querySelector("#include-presentation-copies");i.hidden=e===0,t.disabled=e===0,e===0&&(t.checked=!1)}export{d as pageTextView,n as setDuplicateOption};
