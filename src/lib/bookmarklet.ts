const HASH_BUDGET = 6000;

export function buildCaptureBookmarklet(appOrigin: string): string {
  const origin = new URL(appOrigin).origin;
  const code = `(function(){
var A=${JSON.stringify(origin)};
var M=80;
var t="";
try{t=String(window.getSelection&&window.getSelection().toString()||"").trim()}catch(e){}
if(t.length<M){
var s=["#job-details",".jobs-description__content","#jobDescriptionText","[data-testid='jobDescription']",".jobsearch-JobComponent-description",".job-description",".job-post","article","[role='main']"];
for(var i=0;i<s.length;i++){
var n=document.querySelector(s[i]);
var x=n&&n.innerText&&n.innerText.trim();
if(x&&x.length>=M){t=x.slice(0,5e4);break}
}
}
if(t.length<M)t=String(document.body&&document.body.innerText||"").trim().slice(0,5e4);
if(t.length<M){alert("Select the job description, then click the bookmark again.");return}
try{sessionStorage.setItem("rt_extension_jd",t)}catch(e){}
var left=Math.max(0,(screen.availLeft||0)+screen.availWidth-460);
var url=A+"/?ext=1";
try{var encoded=encodeURIComponent(t);if(encoded.length<${HASH_BUDGET})url+="#rtjd="+encoded}catch(e){}
var w=window.open(url,"resume-tailor","popup=1,width=440,height=900,left="+left+",top=0");
if(!w){alert("Allow popups for Resume Tailor, then click the bookmark again.");return}
var p={source:"resume-tailor-extension",type:"resume-tailor:job-description",text:t};
var n=0;
var i=setInterval(function(){try{w.postMessage(p,A)}catch(e){}if(++n>50)clearInterval(i)},300);
})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function openAppOnTheRight(appOrigin = window.location.origin) {
  const origin = new URL(appOrigin).origin;
  const screenWithOrigin = window.screen as Screen & { availLeft?: number };
  const left = Math.max(
    0,
    (screenWithOrigin.availLeft || 0) + window.screen.availWidth - 460,
  );
  const popup = window.open(
    `${origin}/?ext=1`,
    "resume-tailor",
    `popup=1,width=440,height=900,left=${left},top=0`,
  );
  return Boolean(popup);
}
