/** Ad blockers treat window.open(..., "popup=1,width=...") as an ad. A named tab is allowed. */
function openResumeTailorTab(url: string) {
  try {
    const tab = window.open(url, "resume-tailor");
    if (tab) return tab;
  } catch {
    // uBlock / Adblock Plus / Chrome popup blocker
  }
  return null;
}

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
var url=A+"/?ext=1";
try{url+="#rtjd="+encodeURIComponent(t)}catch(e){}
var w=null;
try{w=window.open(url,"resume-tailor")}catch(e){}
if(!w){location.assign(url);return}
var p={source:"resume-tailor-extension",type:"resume-tailor:job-description",text:t};
var n=0;
var i=setInterval(function(){try{w.postMessage(p,A)}catch(e){}if(++n>50)clearInterval(i)},300);
})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function openAppOnTheRight(appOrigin = window.location.origin) {
  const origin = new URL(appOrigin).origin;
  const url = `${origin}/?ext=1`;
  if (openResumeTailorTab(url)) return true;
  window.location.assign(url);
  return true;
}
