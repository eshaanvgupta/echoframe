import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,NavLink,Route,Routes,useLocation,useNavigate,Link} from 'react-router-dom';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import {AppProvider,useApp} from './context.js';
import {Mark} from './components.js';
import {download,pretty} from './utils.js';
import {Home,Methodology,Grant,Developer} from './pages/info.js';
import {TraceExplorer} from './pages/trace.js';
import {FailureLab} from './pages/lab.js';
import {OutcomeStudio} from './pages/studio.js';
import {Journal,Vault} from './pages/local.js';
import {Story} from './pages/story.js';
import './style.css';

const links=[['/','Overview','⌘'],['/explorer','Trace explorer','⌕'],['/lab','Failure lab','⌁'],['/studio','Outcome studio','◇'],['/journal','Payment journal','▤'],['/vault','Evidence vault','▣'],['/developers','Developer console','⌥'],['/grant','Grant evidence','◈'],['/about/methodology','Methodology','⊕']];
function Shell(){
  const {bundle,network}=useApp();const location=useLocation(),navigate=useNavigate();
  const [drawer,setDrawer]=useState(false),[theme,setTheme]=useState(()=>localStorage.getItem('echoframe-theme')??'dark');const drawerRef=useRef<HTMLElement>(null),menuRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('echoframe-theme',theme);},[theme]);
  useEffect(()=>{setDrawer(false);document.title=`${links.find(([path])=>path===location.pathname)?.[1]??'Evidence'} · ECHOFRAME`;},[location.pathname]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable)return;
      if(e.key==='Escape'){setDrawer(false);menuRef.current?.focus();}if(e.key==='?'&&!e.ctrlKey&&!e.metaKey)navigate('/about/methodology');
      if(e.key==='Tab'&&drawer){const nodes=drawerRef.current?.querySelectorAll<HTMLAnchorElement|HTMLButtonElement>('a,button');const first=nodes?.[0],last=nodes?.[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    };document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);
  },[drawer,navigate]);
  useEffect(()=>{if(drawer)drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();},[drawer]);
  return <><a href="#main" className="skip-link">Skip to content</a><aside ref={drawerRef} className={`sidebar ${drawer?'is-open':''}`} aria-label="Main navigation"><div className="brand"><Mark/><Link to="/">ECHOFRAME<span>// 42220</span></Link><button className="drawer-close" onClick={()=>setDrawer(false)} aria-label="Close navigation">×</button></div><div className="sidebar-label eyebrow">PAYMENT EVIDENCE INSTRUMENT</div><nav>{links.map(([path,label,icon])=><NavLink to={path!} end key={path}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</nav><div className="sidebar-bottom"><div className="local-marker">LOCAL FIRST / NO KEYS</div><p>Your evidence stays on<br/>this device.</p><button className="theme-toggle" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'◐ Light':'◑ Dark'} appearance</button><Link to="/about/methodology">Evidence has limits. Read them.</Link></div></aside>{drawer&&<div className="drawer-backdrop" onClick={()=>setDrawer(false)} aria-hidden="true"/>}<div className="app-shell"><header className="topbar"><div><button ref={menuRef} className="menu-toggle" aria-label="Open navigation" aria-expanded={drawer} onClick={()=>setDrawer(!drawer)}>☰</button><span className="eyebrow">FLIGHT RECORDER <span className="slash">/</span> {links.find(([p])=>p===location.pathname)?.[1]?.toUpperCase()??'NOT FOUND'}</span></div><div className="topbar-right"><span className="network-label">{network}</span><button className="small-button" disabled={!bundle} onClick={()=>bundle&&download('evidence.echoframe.json',pretty(bundle))}>Export evidence</button></div></header><main id="main" tabIndex={-1} key={location.pathname}><Routes><Route path="/" element={<Home/>}/><Route path="/explorer" element={<TraceExplorer/>}/><Route path="/story" element={<Story/>}/><Route path="/lab" element={<FailureLab/>}/><Route path="/studio" element={<OutcomeStudio/>}/><Route path="/journal" element={<Journal/>}/><Route path="/vault" element={<Vault/>}/><Route path="/developers" element={<Developer/>}/><Route path="/grant" element={<Grant/>}/><Route path="/about/methodology" element={<Methodology/>}/><Route path="*" element={<div className="empty"><h1>Signal not found</h1><Link to="/">Return to overview</Link></div>}/></Routes></main><footer className="footer"><span>ECHOFRAME // 42220</span><span>PROVE WHAT YOU CAN. LABEL WHAT YOU CANNOT.</span><Link to="/about/methodology">Verification v1.0.0</Link></footer></div><nav className="bottom-nav" aria-label="Mobile navigation">{links.slice(1,4).concat([links[5]!]).map(([path,label,icon])=><NavLink key={path} to={path!}><span aria-hidden="true">{icon}</span>{label?.replace(' explorer','').replace(' studio','').replace('Evidence ','')}</NavLink>)}<button onClick={()=>setDrawer(true)} aria-label="More navigation"><span aria-hidden="true">☰</span>More</button></nav></>;
}
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string|null}>{
  state:{error:string|null}={error:null};static getDerivedStateFromError(error:Error){return {error:error.message};}
  render(){return this.state.error?<div className="empty"><h1>Evidence workspace interrupted</h1><p>{this.state.error}</p><p>Stored evidence remains local. Reload to reopen the workspace.</p><button onClick={()=>window.location.reload()}>Reload workspace</button></div>:this.props.children;}
}
// GitHub Pages redirects physical entry documents to a trailing slash. Canonicalize before routing.
if(window.location.pathname.endsWith('/')&&window.location.pathname!==import.meta.env.BASE_URL)window.history.replaceState(window.history.state,'',window.location.pathname.replace(/\/+$/,'')+window.location.search+window.location.hash);
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><BrowserRouter basename={import.meta.env.BASE_URL}><AppProvider><Shell/></AppProvider></BrowserRouter></ErrorBoundary></React.StrictMode>);
if('serviceWorker'in navigator&&import.meta.env.PROD)void navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{scope:import.meta.env.BASE_URL}).catch(()=>{});
