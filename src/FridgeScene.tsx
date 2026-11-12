import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import StorageItems from './StorageItems'
import type {PlacedItem,ShelfId} from './StorageItems'
import {SHELF_BASE,layoutFor} from './storagePlanner'

export type DoorKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
export type DoorStates = Record<DoorKey, boolean>
export type Quality = 'eco' | 'balanced' | 'sharp'
export type CameraView = 'hero' | 'front' | 'side' | 'interior'
export type Finish = 'nightWine' | 'metallicBlack' | 'jadeBlue' | 'steelGraphite'
export type FridgeSceneProps = {
  doors: DoorStates
  bucketOpen: boolean
  xray: boolean
  finish: Finish
  view: CameraView
  resetVersion: number
  quality: Quality
  onProgress: (progress: number) => void
  onLoaded: () => void
  onAnimationStatus?: (status: { lowerLeftOpen: boolean; lowerRightOpen: boolean; bucketExtended: boolean; bucketMoving: boolean }) => void
  onError: (message: string) => void
  placements: PlacedItem[]
  onMoveItem: (id:number,x:number,z:number) => void
  onStorageDragging: (dragging:boolean) => void
  storageDragging: boolean
  onShelfPicked: (shelf:ShelfId)=>void
}

const modelUrl = import.meta.env.VITE_FRIDGE_MODEL_URL || '/models/refrigerator.glb'
const initialCamera = new THREE.Vector3(1.94, 1.70, 3.04)
// Lloyd refrigerator catalog references used as *inspiration*, not official
// swatch values or confirmed options for this concept four-door product.
export const finishPresets: Record<Finish, { color: string; metalness: number; roughness: number }> = {
  nightWine: { color: '#572035', metalness: .23, roughness: .43 },
  metallicBlack: { color: '#24272b', metalness: .30, roughness: .39 },
  jadeBlue: { color: '#075369', metalness: .24, roughness: .40 },
  steelGraphite: { color: '#616970', metalness: .29, roughness: .39 },
}
const controllerNames: Record<DoorKey, string> = {
  topLeft: 'CTRL_Door_Top_Left', topRight: 'CTRL_Door_Top_Right',
  bottomLeft: 'CTRL_Door_Bottom_Left', bottomRight: 'CTRL_Door_Bottom_Right'
}

// Closed-pose offsets are taken from the file; all motion is applied relative to the original transforms.
// Door axes/signs may need calibrating in Blender if the source mesh's hinge orientation changes.
function Model({ doors, bucketOpen, xray, finish, placements, onMoveItem, onStorageDragging, onShelfPicked, onLoaded, onAnimationStatus }: Pick<FridgeSceneProps,'doors'|'bucketOpen'|'xray'|'finish'|'placements'|'onMoveItem'|'onStorageDragging'|'onLoaded'|'onAnimationStatus'|'onShelfPicked'>) {
  const { scene } = useGLTF(modelUrl)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = false
        obj.receiveShadow = true
        // Every mesh owns unique material instances; never modify the shared GLTF cache.
        if (Array.isArray(obj.material)) obj.material = obj.material.map(m => m.clone())
        else if (obj.material) obj.material = obj.material.clone()
      }
    })
    return clone
  }, [scene])
  const ctrl = useRef<Record<string, THREE.Object3D>>({})
  const shelfRefs = useRef<Record<ShelfId,THREE.Object3D|null>>({1:null,2:null,3:null})
  const shelfBase = useRef<Record<ShelfId,number>>({...SHELF_BASE})
  const targetShelves = useMemo(()=>layoutFor(placements).layout,[placements])
  const baseRot = useRef<Record<string, number>>({})
  const basePos = useRef<Record<string, number>>({})
  // V10: target only named door groups + known outer cabinet mesh regions.
  // Replace selected mesh slots with per-surface MeshPhysicalMaterial instances;
  // this avoids altering branded parts, glass, plastic drawers and the GLB cache.
  const exteriorPaint = useMemo(() => {
    type Part = { mat: THREE.MeshPhysicalMaterial; role: 'door' | 'cabinet' }
    const parts: Part[] = []
    const norm = (name:string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const cabinetKeys = ['object119', 'object140', 'object112']
    const createPaint = (mesh:THREE.Mesh, role:Part['role'], names:string[]) => {
      if (/branding|brandind|bucket/i.test(mesh.name)) return
      const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const nextMats = oldMats.map(old => {
        if (!old || !names.includes(old.name) || old.name === 'metal_materil') return old
        const mat = new THREE.MeshPhysicalMaterial({
          name: old.name + '__V10_Exterior_' + role,
          color: '#616970', metalness: .18, roughness: .36,
          clearcoat: .32, clearcoatRoughness: .24,
          envMapIntensity: 1.3, side: THREE.DoubleSide,
          transparent: false, opacity: 1, depthWrite: true,
        })
        parts.push({ mat, role })
        return mat
      })
      mesh.material = Array.isArray(mesh.material) ? nextMats : nextMats[0]
    }
    for (const name of Object.values(controllerNames)) {
      const group = model.getObjectByName(name)
      group?.traverse(obj => {
        if (obj instanceof THREE.Mesh) createPaint(obj, 'door', ['Metal', 'Metal_1'])
      })
    }
    model.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return
      // Updated model(3).glb uses Object_119 prefixes again for the *movable
      // shelves*. Never paint or X-ray shelf glass and shelf metal as cabinet.
      let ancestor:THREE.Object3D|null=obj.parent
      while(ancestor && ancestor!==model){
        if(/^CTRL_Shelf_/.test(ancestor.name))return
        ancestor=ancestor.parent
      }
      const nodeName=norm(obj.name)
      if (!cabinetKeys.some(prefix => nodeName.startsWith(prefix))) return
      createPaint(obj,'cabinet',['Metal','Metal_2','Plastic_3'])
    })
    // An open door exposes its inside/back faces. Non-glass finishes must
    // be opaque and double-sided even if their source mesh has no thickness.
    // Keep real glass transparent and preserve the dedicated branding material.
    for (const key of Object.values(controllerNames)) {
      model.getObjectByName(key)?.traverse(obj => {
        if (!(obj instanceof THREE.Mesh) || /branding|brandind/i.test(obj.name)) return
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of materials) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue
          if (/glass|metal_materil/i.test(mat.name)) continue
          mat.side = THREE.DoubleSide
          mat.depthWrite = true
          mat.needsUpdate = true
        }
      })
    }
    if (import.meta.env.DEV) console.info('[V10] Opaque double-sided paint slots:',parts.length)
    return parts
  }, [model])
  const paintDefaults = useMemo(() => exteriorPaint.map(({mat,role}) => ({mat,role})),[exteriorPaint])

  useLayoutEffect(() => {
    const refs: Record<string, THREE.Object3D> = {}
    for (const name of [...Object.values(controllerNames), 'CTRL_Bucket']) {
      const object = model.getObjectByName(name)
      if (object) {
        refs[name] = object
        baseRot.current[name] = object.rotation.y
        basePos.current[name] = object.position.z
      } else console.warn(`Missing refrigerator controller: ${name}`)
    }
    ctrl.current = refs
    for (const i of [1,2,3] as ShelfId[]) {
      const shelf=model.getObjectByName(`CTRL_Shelf_0${i}`)
      shelfRefs.current[i]=shelf??null
      if(shelf)shelfBase.current[i]=shelf.position.y
      else console.warn('Missing shelf controller',i)
    }
    onLoaded()
  }, [model, onLoaded])

  useEffect(() => {
    const preset = finishPresets[finish]
    paintDefaults.forEach(({mat,role}) => {
      mat.color.set(preset.color)
      // Match color across panels. Controlled studio reflections now provide
      // all variation; avoid old metallic white blowouts and painted emission.
      // Both door and cabinet share the same pigment. Surface roughness may
      // vary slightly, but the face and side must not receive different colors.
      mat.metalness = finish === 'metallicBlack' ? .32 : Math.max(.18,preset.metalness)
      mat.roughness = Math.max(.28,preset.roughness - .055 + (role === 'cabinet' ? .025 : 0))
      mat.clearcoat = finish === 'metallicBlack' ? .48 : .40
      mat.clearcoatRoughness = .20
      mat.emissive.set('#000000'); mat.emissiveIntensity = 0
      mat.envMapIntensity = 1.35
      mat.needsUpdate = true
    })
  },[finish,paintDefaults])

  useEffect(() => {
    paintDefaults.forEach(({mat}) => {
      // X-ray is opt-in only. Closed/off surfaces remain fully opaque,
      // and both sides are visible when a door rotates around its hinge.
      mat.transparent = xray
      mat.opacity = xray ? .18 : 1
      mat.depthWrite = !xray
      mat.side = THREE.DoubleSide
      mat.needsUpdate=true
    })
  },[xray,paintDefaults])

  const lastState = useRef('')
  useFrame((_, delta) => {
    for(const i of [1,2,3] as ShelfId[]){
      const shelf=shelfRefs.current[i]
      if(shelf){
        const target=shelfBase.current[i]+targetShelves[i]-SHELF_BASE[i]
        shelf.position.y=THREE.MathUtils.damp(shelf.position.y,target,3.5,Math.min(delta,.05))
      }
    }
    const a = 1 - Math.exp(-Math.min(delta,.05) * 4.7)
    const bucket = ctrl.current.CTRL_Bucket
    const bucketBase = basePos.current.CTRL_Bucket ?? 0
    // Real-time safety interlock: keep lower doors physically open until the
    // bucket is almost fully home. No fragile setTimeout sequencing.
    const bucketNotRetracted = bucket && Math.abs(bucket.position.z - bucketBase) > .012
    // For a +Z-facing fridge: left door swings -Y, right door +Y.
    for (const key of Object.keys(controllerNames) as DoorKey[]) {
      const name = controllerNames[key]
      const object = ctrl.current[name]
      if (!object) continue
      const sign = key.endsWith('Left') ? -1 : 1
      const holdForBucket = key.startsWith('bottom') && (bucketOpen || !!bucketNotRetracted)
      const target = (baseRot.current[name] ?? 0) + ((doors[key] || holdForBucket) ? sign * 110 * Math.PI / 180 : 0)
      object.rotation.y = THREE.MathUtils.lerp(object.rotation.y, target, a)
    }
    if (bucket) {
      // The drawer may extend only after BOTH bottom doors reach 95 degrees.
      const lowerKeys: DoorKey[] = ['bottomLeft', 'bottomRight']
      const clearance = lowerKeys.every(key => {
        const name=controllerNames[key]
        const door=ctrl.current[name]
        return door && Math.abs(door.rotation.y - (baseRot.current[name] ?? 0)) >= 95 * Math.PI / 180
      })
      const distance = bucketOpen && clearance ? .46 : 0
      const target = bucketBase + distance
      bucket.position.z = THREE.MathUtils.lerp(bucket.position.z, target, a)
    }
    // Report actual mechanical pose at changes only (not every frame).
    if (onAnimationStatus) {
      const left=ctrl.current[controllerNames.bottomLeft]
      const right=ctrl.current[controllerNames.bottomRight]
      const actual = {
        lowerLeftOpen: !!left && Math.abs(left.rotation.y - (baseRot.current[controllerNames.bottomLeft] ?? 0)) > 30 * Math.PI / 180,
        lowerRightOpen: !!right && Math.abs(right.rotation.y - (baseRot.current[controllerNames.bottomRight] ?? 0)) > 30 * Math.PI / 180,
        bucketExtended: !!bucket && Math.abs(bucket.position.z - bucketBase) >= .43,
        bucketMoving: !!bucket && Math.abs(bucket.position.z - bucketBase - (bucketOpen ? .46 : 0)) > .025,
      }
      const value=JSON.stringify(actual)
      if (value!==lastState.current) {lastState.current=value;onAnimationStatus(actual)}
    }
  })

  return <group><primitive object={model} onClick={e=>{
    let obj:THREE.Object3D|null=e.object
    while(obj && obj!==model){
      for(const i of [1,2,3] as ShelfId[]){if(obj===shelfRefs.current[i]){onShelfPicked(i);return}}
      obj=obj.parent
    }
  }}/><Suspense fallback={null}><StorageItems placements={placements} shelfControllers={shelfRefs.current} onMove={onMoveItem} onDragging={onStorageDragging}/></Suspense></group>
}

function CameraRig({ view, resetVersion, controlsRef }: {view:CameraView;resetVersion:number;controlsRef:React.RefObject<OrbitControlsImpl | null>}) {
  const { camera } = useThree()
  const targetPos = useRef(initialCamera.clone())
  const targetLook = useRef(new THREE.Vector3(0,.95,0))
  const transitioning = useRef(true)
  useEffect(() => {
    const presets: Record<CameraView, [number,number,number]> = {
      hero: [1.94,1.70,3.04], front: [0,1.50,3.15], side: [3.25,1.52,0.15], interior: [0,1.52,2.94]
    }
    targetPos.current.set(...presets[view])
    targetLook.current.set(0, .95, 0)
    transitioning.current=true
  }, [view,resetVersion])
  useFrame((_,delta)=> {
    if (!transitioning.current) return
    const t=1-Math.exp(-Math.min(delta,.05)*3.6)
    camera.position.lerp(targetPos.current,t)
    const controls=controlsRef.current
    if (controls) {controls.target.lerp(targetLook.current,t);controls.update()}
    if(camera.position.distanceTo(targetPos.current)<.015)transitioning.current=false
  })
  return null
}

// Soft radial floor shadow; avoids the large rectangular floor patch of V06.
function GroundShadow() {
  const texture = useMemo(() => {
    const size = 128
    const data = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + .5) / size * 2 - 1
      const v = (y + .5) / size * 2 - 1
      const radius = Math.sqrt(u*u + v*v)
      const intensity = Math.pow(Math.max(0,1-radius), 2.3)
      const idx = (y * size + x) * 4
      data[idx] = 10; data[idx+1] = 4; data[idx+2] = 10
      data[idx+3] = Math.round(205 * intensity)
    }
    const t = new THREE.DataTexture(data,size,size,THREE.RGBAFormat)
    t.needsUpdate=true
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.033,0]}>
    <planeGeometry args={[2.5,2.1]}/>
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false}/>
  </mesh>
}

// V10: brighter, stable local softbox reflections (no HDR download required).
// Environment lightformers generate broad vertical highlight bands on the
// refrigerator instead of harsh point-light patches or flat white illumination.
function StudioReflections() {
  return <Environment resolution={128} frames={1} environmentIntensity={1.15}>
    <Lightformer form="rect" intensity={5.5} color="#f9f7f4" position={[-3, 2, 4]} rotation={[0,Math.PI/4,0]} scale={[1.5,4.5,1]}/>
    <Lightformer form="rect" intensity={4.4} color="#e6efff" position={[4, 1.4, 3]} rotation={[0,-Math.PI/3,0]} scale={[.9,3.6,1]}/>
    <Lightformer form="rect" intensity={2.3} color="#f3b6b1" position={[-2,2,-4]} rotation={[0,-Math.PI/5,0]} scale={[2,3,1]}/>
    <Lightformer form="rect" intensity={3.0} color="#ffffff" position={[0,5,1]} rotation={[Math.PI/2,0,0]} scale={[4,2,1]}/>
  </Environment>
}

function StudioFloor() {
  return <>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.051,0]}>
      <circleGeometry args={[1.65,72]}/>
      <meshBasicMaterial color="#351724" transparent opacity={.35} depthWrite={false}/>
    </mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.050,0]}>
      <ringGeometry args={[1.49,1.495,96]}/>
      <meshBasicMaterial color="#d996ad" transparent opacity={.28} depthWrite={false}/>
    </mesh>
    <GroundShadow/>
  </>
}

function SceneContent(props:FridgeSceneProps & {controlsRef:React.RefObject<OrbitControlsImpl | null>}) {
  return <>
    <ambientLight intensity={1.05} color="#ffffff"/>
    <hemisphereLight intensity={1.05} color="#e9f0ff" groundColor="#74606c"/>
    <directionalLight position={[-4,6,6]} intensity={3.4} color="#fffdf7"/>
    <directionalLight position={[4,3,5]} intensity={2.8} color="#f5faff"/>
    <directionalLight position={[1.5,4,-4]} intensity={2.25} color="#ffffff"/>
    <Suspense fallback={null}>
      <Model {...props}/>
      <StudioReflections/>
      <StudioFloor/>
    </Suspense>
    <OrbitControls enabled={!props.storageDragging} ref={props.controlsRef} makeDefault target={[0,.95,0]}
      enablePan={false} minDistance={2.25} maxDistance={6.0}
      minPolarAngle={.43} maxPolarAngle={Math.PI*.52}
      enableDamping dampingFactor={.085}/>
    <CameraRig view={props.view} resetVersion={props.resetVersion} controlsRef={props.controlsRef}/>
  </>
}

export default function FridgeScene(props:FridgeSceneProps) {
  const controlsRef=useRef<OrbitControlsImpl|null>(null)
  const [webglError,setWebglError]=useState(false)
  const dpr = props.quality==='eco'?[.75,1]:props.quality==='balanced'?[1,1.25]:[1,1.5]
  return <div className="canvas-host" data-cursor-zone="rotate">
    {webglError ? <div className="canvas-error">3D rendering is unavailable on this device. Try Eco quality or a browser with hardware acceleration enabled.</div> :
    <Canvas camera={{position:[1.94,1.70,3.04],fov:35,near:.1,far:100}} dpr={dpr as [number,number]} gl={{antialias:true,alpha:true,powerPreference:'default',preserveDrawingBuffer:false}} onCreated={({gl})=>{
      gl.toneMapping=THREE.ACESFilmicToneMapping
      gl.toneMappingExposure=1.12
      gl.outputColorSpace=THREE.SRGBColorSpace
      gl.setClearColor(0x000000, 0)
      const canvas=gl.domElement
      canvas.addEventListener('webglcontextlost',(event)=>{event.preventDefault();setWebglError(true);props.onError('Your graphics context was lost. Reload the page in Eco mode.')},{once:true})
    }}>
      <SceneContent {...props} controlsRef={controlsRef}/>
    </Canvas>}
  </div>
}
