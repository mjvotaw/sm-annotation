import{WritableStream as o}from"./web-streams-ponyfill-4a0f4950.js";const i=globalThis.WritableStream||o;class r extends i{constructor(e,t){super(e,t),this._closed=!1,Object.setPrototypeOf(this,r.prototype)}close(){this._closed=!0;const e=this.getWriter(),t=e.close();return e.releaseLock(),t}seek(e){return this.write({type:"seek",position:e})}truncate(e){return this.write({type:"truncate",size:e})}write(e){if(this._closed)return Promise.reject(new TypeError("Cannot write to a CLOSED writable stream"));const t=this.getWriter(),s=t.write(e);return t.releaseLock(),s}}Object.defineProperty(r.prototype,Symbol.toStringTag,{value:"FileSystemWritableFileStream",writable:!1,enumerable:!1,configurable:!0});Object.defineProperties(r.prototype,{close:{enumerable:!0},seek:{enumerable:!0},truncate:{enumerable:!0},write:{enumerable:!0}});export{r as FileSystemWritableFileStream,r as default};
