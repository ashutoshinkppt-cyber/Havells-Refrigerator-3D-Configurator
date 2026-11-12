import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Box, Package, Wine, CookingPot, Trash2, Check, ChevronDown, DoorClosed, DoorOpen, Expand, Eye, Layers3, Maximize, Rotate3D, RotateCcw, X } from 'lucide-react'
import { useProgress } from '@react-three/drei'
import FridgeScene from './FridgeScene'
import type { CameraView, DoorKey, DoorStates, Finish, Quality } from './FridgeScene'
import { finishPresets } from './FridgeScene'
import {STORAGE_CATALOG,findCatalog,SHELF_NAMES} from './StorageItems'
import type {PlacedItem,StorageItemId,ShelfId} from './StorageItems'
import {addPlacement,isMoveValid} from './storagePlanner'

const initialDoors: DoorStates = { topLeft: false, topRight: false, bottomLeft: false, bottomRight: false }
const finishes: { id: Finish; label: string; color: string }[] = [
  { id: 'nightWine', label: 'Night Petals Wine', color: finishPresets.nightWine.color },
  { id: 'metallicBlack', label: 'Metallic Black', color: finishPresets.metallicBlack.color },
  { id: 'jadeBlue', label: 'Gold Jade Blue', color: finishPresets.jadeBlue.color },
  { id: 'steelGraphite', label: 'Steel Graphite', color: finishPresets.steelGraphite.color },
]
const doorButtons: { id: DoorKey; label: string }[] = [
  { id: 'topLeft', label: 'Top left' }, { id: 'topRight', label: 'Top right' },
  { id: 'bottomLeft', label: 'Bottom left' }, { id: 'bottomRight', label: 'Bottom right' },
]
const cameras: { id: CameraView; label: string; icon: typeof Box }[] = [
  { id: 'hero', label: '3/4', icon: Box }, { id: 'front', label: 'Front', icon: Eye },
  { id: 'side', label: 'Side', icon: Rotate3D }, { id: 'interior', label: 'Interior', icon: DoorOpen },
]
function LoadingProgress({ setProgress }: {setProgress: (value: number) => void}) {
  const { progress } = useProgress()
  useEffect(() => { setProgress(progress) }, [progress, setProgress])
  return null
}
export default function App() {
  const [finish, setFinish] = useState<Finish>('metallicBlack')
  const [doors, setDoors] = useState<DoorStates>(initialDoors)
  const [bucketOpen, setBucketOpen] = useState(false)
  const [xray, setXray] = useState(false)
  const [view, setView] = useState<CameraView>('hero')
  const [quality, setQuality] = useState<Quality>('balanced')
  const [resetVersion, setResetVersion] = useState(0)
  const [started, setStarted] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sceneError, setSceneError] = useState('')
  const [mobilePanel, setMobilePanel] = useState(false)
  const [toast, setToast] = useState('')
  const [placements,setPlacements]=useState<PlacedItem[]>([])
  const [selectedStorage,setSelectedStorage]=useState<StorageItemId>('bottle1l')
  const [selectedShelf,setSelectedShelf]=useState<ShelfId>(1)
  const [storageTab,setStorageTab]=useState('Bottles')
  const [storageError,setStorageError]=useState('')
  const [storageDragging,setStorageDragging]=useState(false)
  const [mechanics, setMechanics] = useState({lowerLeftOpen:false,lowerRightOpen:false,bucketExtended:false,bucketMoving:false})
  const onLoaded = useCallback(() => setModelLoaded(true), [])
  const onProgress = useCallback((p: number) => setProgress(p), [])
  const onError = useCallback((msg: string) => setSceneError(msg), [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) }, [toast])
  const toggleDoor = (id: DoorKey) => {
    if (id.startsWith('bottom') && doors[id] && bucketOpen) {
      setBucketOpen(false)
      setDoors(current => ({...current, bottomLeft:false, bottomRight:false}))
      return
    }
    setDoors(current => ({ ...current, [id]: !current[id] }))
  }
  const toggleBucket = () => {
    if (!bucketOpen) {
      setDoors(current => ({...current, bottomLeft: true, bottomRight: true}))
      setBucketOpen(true)
    } else {
      // Renderer holds the lower hinges open until the bucket retracts.
      setBucketOpen(false)
      setDoors(current => ({...current, bottomLeft:false, bottomRight:false}))
    }
  }
  const allOpen = doorButtons.every(item => doors[item.id])
  const actualDoorCount = Number(doors.topLeft) + Number(doors.topRight) +
    Number(mechanics.lowerLeftOpen || doors.bottomLeft) + Number(mechanics.lowerRightOpen || doors.bottomRight)
  const toggleAll = () => {
    if (allOpen) {setBucketOpen(false); setDoors(initialDoors)}
    else setDoors({ topLeft: true, topRight: true, bottomLeft: true, bottomRight: true })
  }
  const reset = () => {
    setPlacements([]);setStorageError('');setSelectedShelf(1);setSelectedStorage('bottle1l');setStorageTab('Bottles')
    setFinish('metallicBlack'); setDoors(initialDoors); setBucketOpen(false)
    setXray(false); setView('hero'); setQuality('balanced'); setResetVersion(n => n + 1)
    setToast('Configuration reset')
  }
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }
  const selectView = (next: CameraView) => {
    setView(next)
    if (next === 'interior') setDoors(d => ({ ...d, topLeft: true, topRight: true }))
  }
  const openModel = () => { setStarted(true); setSceneError('') }
  const placeItem=(shelf:ShelfId=selectedShelf)=>{
    const next=addPlacement(placements,selectedStorage,shelf)
    if(next.error){setStorageError(next.error);return}
    setPlacements(next.placements);setStorageError('')
    setSelectedShelf(shelf);setStarted(true)
    setDoors(current=>({...current,topLeft:true,topRight:true}))
    setView('interior')
  }
  const removeItem=(id:number)=>{setPlacements(items=>items.filter(it=>it.id!==id));setStorageError('')}
  const moveItem=useCallback((id:number,x:number,z:number)=>{
    setPlacements(items=>isMoveValid(items,id,x,z) ? items.map(it=>it.id===id?{...it,x,z}:it) : items)
  },[])
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="havells-logo"><img src="/havells-mark.png" alt="Havells" onError={(e) => {e.currentTarget.style.display="none"}}/><span>HAVELLS</span></span><span className="brand-subtitle">REFRIGERATOR CONCEPT STUDIO</span></div>
      <div className="header-center">FOUR-DOOR REFRIGERATOR <span className="product-index">/ CONCEPT 001</span></div>
      <div className="header-buttons"><button className="header-button" onClick={reset} title="Reset configuration"><RotateCcw size={17}/><span>Reset</span></button><button className="header-button" onClick={fullscreen} title="Fullscreen"><Expand size={17}/><span>Fullscreen</span></button></div>
    </header>
    <div className="main-layout">
      <section className="viewer-column" aria-label="Interactive refrigerator viewer">
        <div className="viewer-stage">
          <div className="stage-top"><span className="stage-eyebrow"><span className="live-dot"/> HAVELLS / INTERACTIVE 3D CONCEPT</span><span className="stage-step">01 / 01</span></div>
          
          {started ? <FridgeScene placements={placements} onMoveItem={moveItem} onShelfPicked={(shelf)=>{setSelectedShelf(shelf);setStorageError('')}} storageDragging={storageDragging} onStorageDragging={setStorageDragging} onAnimationStatus={setMechanics} doors={doors} bucketOpen={bucketOpen} xray={xray} finish={finish} view={view} resetVersion={resetVersion} quality={quality} onLoaded={onLoaded} onProgress={onProgress} onError={onError}/> : <div className="launch-overlay"><div className="launch-mark"><Box size={42}/></div><strong>Explore your refrigerator</strong><span>360° views · Four doors · Storage · X-ray</span><button className="launch-action" onClick={openModel}>ENTER 3D SHOWROOM <ArrowUpRight size={18}/></button></div>}
          {started && !modelLoaded && !sceneError && <div className="loading-overlay"><div className="load-ring"><Box size={34}/></div><strong>Loading 3D refrigerator</strong><div className="progress-bar"><div style={{ width: `${Math.round(progress)}%` }}/></div><small>{Math.round(progress)}%</small></div>}
          {sceneError && <div className="error-overlay"><strong>3D viewer unavailable</strong><span>{sceneError}</span><button onClick={() => window.location.reload()}>Reload</button></div>}
          <div className="stage-bottom"><span><Rotate3D size={16}/> DRAG TO ROTATE <i/> SCROLL TO ZOOM</span><button onClick={fullscreen} aria-label="Fullscreen viewer"><Maximize size={18}/></button></div>
        </div>
        <div className="camera-dock"><span className="dock-label">CAMERA</span><div className="camera-actions">{cameras.map(item => <button key={item.id} className={'camera-button ' + (view === item.id ? 'is-active' : '')} onClick={() => selectView(item.id)}><item.icon size={19}/><span>{item.label}</span></button>)}</div><button className="camera-reset" title="Reset camera" onClick={() => { setView('hero'); setResetVersion(n => n + 1) }}><RotateCcw size={18}/></button></div>
      </section>
      <aside className={'config-side ' + (mobilePanel ? 'mobile-expanded' : '')} aria-label="Refrigerator configuration controls">
        <div className="panel-heading"><div><span className="eyebrow">CONFIGURE / 01</span><h2>Customize</h2><p>Finish · Storage · Doors</p></div><button className="panel-close" onClick={() => setMobilePanel(false)} aria-label="Close configuration"><X size={20}/></button></div>
        <div className="panel-scroll">
          <section className="config-section finishes-section"><div className="section-title"><span>01</span><strong>REFRIGERATOR FINISHES</strong></div><div className="finish-swatches">{finishes.map(item => <button key={item.id} className={'finish-option ' + (finish === item.id ? 'chosen' : '')} onClick={() => setFinish(item.id)} aria-label={'Select ' + item.label} aria-pressed={finish === item.id}><span className="finish-dot" style={{background:item.color}}/><small title={item.label}>{item.label}</small>{finish === item.id && <Check size={13} className="finish-check"/>}</button>)}</div></section>
          <section className="config-section storage-section">
            <div className="section-title"><span>02</span><strong>SMART STORAGE</strong></div>
            <div className="storage-compact-tabs">{['Bottles','Utensils','Containers'].map(tab=><button key={tab} className={storageTab===tab?'storage-tab active':'storage-tab'} onClick={()=>{setStorageTab(tab);setSelectedStorage(STORAGE_CATALOG.find(i=>i.category===tab)!.id);setStorageError('')}}>{tab==='Bottles'?<Wine size={15}/>:tab==='Utensils'?<CookingPot size={15}/>:<Package size={15}/>} {tab}</button>)}</div>
            <div className="storage-compact-row">
              <label className="storage-field">ITEM <select value={selectedStorage} onChange={e=>{setSelectedStorage(e.target.value as StorageItemId);setStorageError('')}} aria-label="Storage item">{STORAGE_CATALOG.filter(it=>it.category===storageTab).map(it=><option key={it.id} value={it.id}>{it.name}</option>)}</select></label>
              <label className="storage-field">SHELF <select value={selectedShelf} onChange={e=>setSelectedShelf(Number(e.target.value) as ShelfId)} aria-label="Select shelf">{([1,2,3] as ShelfId[]).map(id=><option value={id} key={id}>{SHELF_NAMES[id]}</option>)}</select></label>
              <button className="storage-place" onClick={()=>placeItem()} title={'Place '+findCatalog(selectedStorage).name}><Package size={16}/> ADD ITEM</button>
            </div>
            {storageError&&<p className="storage-error" role="alert">{storageError}</p>}
            <p className="storage-hint">Choose an item and a shelf, then add it to the 3D view.</p>
            {placements.length>0&&<div className="placed-panel"><div className="placed-heading"><strong>{placements.length} ITEM{placements.length!==1?'S':''} PLACED</strong><button onClick={()=>{setPlacements([]);setStorageError('')}}><Trash2 size={14}/> Clear</button></div><div className="placed-list">{placements.map(p=><div className="placed-row" key={p.id}><span>{findCatalog(p.item).name}<small> · {SHELF_NAMES[p.shelf]}</small></span><button onClick={()=>removeItem(p.id)} aria-label={'Remove '+findCatalog(p.item).name}><X size={15}/></button></div>)}</div></div>}
          </section>
          <details className="config-accordion"><summary>Doors<ChevronDown size={16}/></summary>
          <section className="config-section doors-section"><div className="section-title"><span>03</span><strong>DOOR CONTROLS</strong></div><div className="door-grid">{doorButtons.map(item => <button key={item.id} className={'door-control ' + (doors[item.id] ? 'engaged' : '')} onClick={() => toggleDoor(item.id)} aria-pressed={doors[item.id]}>{doors[item.id] ? <DoorOpen size={20}/> : <DoorClosed size={20}/>}<span>{item.label}</span><small>{doors[item.id] ? 'OPEN' : 'CLOSED'}</small></button>)}</div><button className="all-door-button" onClick={toggleAll}>{allOpen ? 'CLOSE ALL DOORS' : 'OPEN ALL DOORS'} <ChevronDown size={17}/></button></section>
          </details>
          <details className="config-accordion"><summary>Extra features<ChevronDown size={16}/></summary>
          <section className="config-section features-section"><div className="section-title"><span>04</span><strong>FEATURES</strong></div><button className={'feature-toggle prominent ' + (xray ? 'feature-on' : '')} onClick={() => setXray(v => !v)} aria-pressed={xray}><span className="feature-icon"><Layers3 size={20}/></span><span className="feature-label"><strong>X-ray mode</strong><small>See through exterior doors and body</small></span><span className={'toggle-track ' + (xray ? 'enabled' : '')}><i/></span></button><button className={'feature-toggle ' + (bucketOpen ? 'feature-on' : '')} onClick={toggleBucket} aria-pressed={bucketOpen}><span className="feature-icon"><Box size={19}/></span><span className="feature-label"><strong>Storage bucket</strong><small>{bucketOpen ? (mechanics.bucketExtended ? 'Extended' : 'Opening lower doors, then extending') : (mechanics.bucketMoving ? 'Retracting, then closing doors' : 'Closed')}</small></span><span className={'toggle-track ' + (bucketOpen ? 'enabled' : '')}><i/></span></button></section>
          </details>
          <details className="config-accordion"><summary>Display quality<ChevronDown size={16}/></summary>
          <section className="config-section settings-section"><div className="section-title"><span>05</span><strong>DISPLAY SETTINGS</strong></div><label className="quality-row">Render quality <span className="select-container"><select aria-label="Render quality" value={quality} onChange={e => setQuality(e.target.value as Quality)}><option value="eco">Low</option><option value="balanced">Balanced</option><option value="sharp">High</option></select><ChevronDown size={15}/></span></label></section>
          </details>
        </div>
        <div className="panel-footer"><div className="selection-summary"><span><small>FINISH</small><strong>{finishes.find(f=>f.id===finish)?.label}</strong></span><span><small>DOORS OPEN</small><strong>{actualDoorCount} / 4</strong></span><span><small>X-RAY</small><strong>{xray?'ON':'OFF'}</strong></span></div><button className="primary-reset" onClick={reset}><RotateCcw size={17}/> RESET CONFIGURATION</button></div>
      </aside>
    </div>
    <button className="mobile-config-button" onClick={() => setMobilePanel(v=>!v)}><Layers3 size={18}/> {mobilePanel ? 'CLOSE CONTROLS' : 'CUSTOMIZE REFRIGERATOR'} <ChevronDown size={17}/></button>
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    <LoadingProgress setProgress={onProgress}/>
  </div>
}
