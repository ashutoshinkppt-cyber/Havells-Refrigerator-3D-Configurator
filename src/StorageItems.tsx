import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export type StorageItemId = 'bottle500'|'bottle1l'|'bottle2l'|'utensilSmall'|'utensilMedium'|'utensilLarge'|'container500'|'container1l'|'container2l'
export type ShelfId = 1|2|3
export type PlacedItem = { id: number; item: StorageItemId; shelf: ShelfId; x: number; z: number }
export const SHELF_NAMES: Record<ShelfId,string> = {1:'Lower shelf',2:'Middle shelf',3:'Upper shelf'}
export const STORAGE_CATALOG: {id:StorageItemId; name:string; category:string; node:string; approximateHeight:number; footprint:number; depth:number}[] = [
  {id:'bottle500',name:'500 ml bottle',category:'Bottles',node:'ITEM_Bottle_500ml',approximateHeight:0.242,footprint:0.086,depth:0.086},
  {id:'bottle1l',name:'1 L bottle',category:'Bottles',node:'ITEM_Bottle_1l',approximateHeight:0.283,footprint:0.101,depth:0.101},
  {id:'bottle2l',name:'2 L bottle',category:'Bottles',node:'ITEM_Bottle_2l',approximateHeight:0.325,footprint:0.116,depth:0.116},
  {id:'utensilSmall',name:'Small utensil',category:'Utensils',node:'ITEM_Utensil_Small',approximateHeight:0.131,footprint:0.239,depth:0.19},
  {id:'utensilMedium',name:'Medium utensil',category:'Utensils',node:'ITEM_Utensil_Medium',approximateHeight:0.174,footprint:0.316,depth:0.252},
  {id:'utensilLarge',name:'Large utensil',category:'Utensils',node:'Kitchen BiITEM_Utensil_Large',approximateHeight:0.209,footprint:0.382,depth:0.304},
  {id:'container500',name:'500 ml container',category:'Containers',node:'ITEM_Container_500ml',approximateHeight:0.046,footprint:0.089,depth:0.132},
  {id:'container1l',name:'1 L container',category:'Containers',node:'ITEM_Container_1l',approximateHeight:0.058,footprint:0.113,depth:0.167},
  {id:'container2l',name:'2 L container',category:'Containers',node:'ITEM_Container_2l',approximateHeight:0.07,footprint:0.13,depth:0.193},
]
export const findCatalog = (id:StorageItemId) => STORAGE_CATALOG.find(it=>it.id===id)!

// Renderer instantiates real, unmodified meshes from Items.glb. The library's
// original X offsets are removed before a clone is positioned on a shelf.
function ItemInstance({placement,shelfControllers,setDragging,onMove}: {
  placement:PlacedItem; shelfControllers:Record<ShelfId,THREE.Object3D|null>;
  setDragging:(id:number|null)=>void;
  onMove:(id:number,x:number,z:number)=>void;
}) {
  const {scene} = useGLTF('/models/storage_items.glb')
  const sourceName = findCatalog(placement.item).node
  const mesh = useMemo(()=>{
    let source=scene.getObjectByName(sourceName)
    if(!source){
      const normalized=(n:string)=>n.toLowerCase().replace(/[^a-z0-9]/g,'')
      scene.traverse(obj=>{
        if(!source && (normalized(obj.name)===normalized(sourceName) ||
          (placement.item==='utensilLarge' && normalized(obj.name).includes('itemutensillarge'))))source=obj
      })
    }
    if(!source) {console.warn('Storage asset missing:',sourceName);return new THREE.Group()}
    const clone=source.clone(true)
    // Remove only the asset-library lineup position, preserve item scale and children.
    clone.position.set(0,0,0)
    clone.updateMatrixWorld(true)
    clone.traverse(obj=>{
      if(!(obj instanceof THREE.Mesh))return
      obj.castShadow=false
      obj.receiveShadow=true
      const polish=(old:THREE.Material):THREE.Material=>{
        const mat=old.clone()
        if(!(mat instanceof THREE.MeshStandardMaterial))return mat
        const n=old.name.toLowerCase().trim()
        if(n==='mat_bottle_plastic_clear' || n==='material.001'){
          // Source model used IOR 10.02: impossible for PET and makes bottles
          // black/chrome in a studio environment. Use stable translucent PET.
          const glass=new THREE.MeshPhysicalMaterial({
            name:old.name+'__PET',color:n==='material.001'?'#d1e6f0':'#d7edf6',
            metalness:0,roughness:.19,transmission:0,transparent:true,
            opacity:n==='material.001'?.31:.48,depthWrite:false,
            ior:1.46,thickness:.007,clearcoat:.52,clearcoatRoughness:.16,
            envMapIntensity:.78,side:THREE.DoubleSide
          })
          mat.dispose()
          return glass
        }
        if(n.includes('bottle_lable')){
          mat.metalness=0;mat.roughness=.76;mat.envMapIntensity=.55
          mat.transparent=false;mat.opacity=1
        }else if(n.includes('bottle_cap')){
          mat.color.set('#59b4d7');mat.metalness=.03;mat.roughness=.36
        }else if(n.includes('pot_light metal') || n.includes('pot_dark metal')){
          // Keep the original asset's geometry but replace grungy/chrome maps
          // with satin brushed cookware steel. A slight normal map is retained.
          mat.map=null;mat.metalness=.78;mat.roughness=n.includes('dark')?.42:.34
          mat.color.set(n.includes('dark')?'#899399':'#c4cbcf')
          mat.metalnessMap=null;mat.roughnessMap=null
          mat.normalScale.set(.12,.12);mat.envMapIntensity=.8
        }else if(n.includes('pot_cover metal')){
          mat.color.set('#c5cbd0');mat.metalness=.77;mat.roughness=.33;mat.envMapIntensity=.8
        }else if(n.includes('pot_handle cooper')){
          mat.map=null;mat.color.set('#a66c38');mat.metalness=.16;mat.roughness=.43
          mat.metalnessMap=null;mat.roughnessMap=null;mat.normalScale.set(.15,.15)
        }else if(n.includes('pot_glass')){
          mat.color.set('#cbdce2');mat.metalness=.02;mat.roughness=.22
          mat.transparent=true;mat.opacity=.45;mat.depthWrite=false
        }else if(n==='mat_utensil_steel'){
          // These are *container bodies*, despite the Blender material name.
          mat.color.set('#c7dee0');mat.metalness=.02;mat.roughness=.36
          mat.transparent=true;mat.opacity=.78;mat.depthWrite=true
        }else if(n==='mat_utensil_handel'){
          // These are *container lids*.
          mat.color.set('#e5edf0');mat.metalness=.04;mat.roughness=.4
          mat.transparent=false;mat.opacity=1;mat.depthWrite=true
        }
        mat.needsUpdate=true
        return mat
      }
      obj.material=Array.isArray(obj.material)?obj.material.map(polish):polish(obj.material)
    })
    return clone
  },[scene,sourceName,placement.item])
  const group=useRef<THREE.Group>(null)
  const box=useMemo(()=>{
    mesh.updateMatrixWorld(true)
    return new THREE.Box3().setFromObject(mesh)
  },[mesh])
  const center=useMemo(()=>box.getCenter(new THREE.Vector3()),[box])
  const shelfWorld = useRef(new THREE.Box3())
  const glassSurfaces = useRef<Record<number,THREE.Mesh|null>>({})
  const surfaceFor=(shelf:THREE.Object3D,which:number)=>{
    let glass=glassSurfaces.current[which]
    if(!glass){
      shelf.traverse(o=>{
        if(glass || !(o instanceof THREE.Mesh))return
        const mats=Array.isArray(o.material)?o.material:[o.material]
        if(mats.some(m=>m?.name.toLowerCase().includes('glass')))glass=o
      })
      glassSurfaces.current[which]=glass??null
    }
    return glass??shelf
  }
  const plane=useMemo(()=>new THREE.Plane(new THREE.Vector3(0,1,0)),[])
  const temp=useMemo(()=>new THREE.Vector3(),[])
  const activeDrag=useRef(false)
  useFrame(()=>{
    const shelf=shelfControllers[placement.shelf]
    if(!shelf || !group.current)return
    shelf.updateWorldMatrix(true,true)
    shelfWorld.current.setFromObject(surfaceFor(shelf,placement.shelf))
    const b=shelfWorld.current
    const shelfCenter=b.getCenter(temp)
    // Use the REAL glass surface, not the metal lip. The item's bottom
    // geometry is placed exactly on the glass, plus 0.5mm to avoid z fighting.
    group.current.position.set(
      shelfCenter.x+(placement.x-.5)*.72,
      b.max.y+.0005,
      shelfCenter.z+(placement.z-.5)*.43
    )
  })
  return <group ref={group} onPointerDown={e=>{
    e.stopPropagation();activeDrag.current=true;setDragging(placement.id)
    if(group.current)plane.constant=-group.current.position.y
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }} onPointerMove={e=>{
    if(!activeDrag.current)return
    e.stopPropagation()
    const shelf=shelfControllers[placement.shelf]
    if(!shelf)return
    e.ray.intersectPlane(plane,temp)
    shelfWorld.current.setFromObject(surfaceFor(shelf,placement.shelf))
    const b=shelfWorld.current,c=b.getCenter(new THREE.Vector3())
    onMove(placement.id,THREE.MathUtils.clamp((temp.x-c.x)/.72+.5,0,1),THREE.MathUtils.clamp((temp.z-c.z)/.43+.5,0,1))
  }} onPointerUp={e=>{if(activeDrag.current){e.stopPropagation();activeDrag.current=false;setDragging(null);(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)}}}>
    <group position={[-center.x,-box.min.y,-center.z]}><primitive object={mesh}/></group>
  </group>
}

export default function StorageItems({placements,shelfControllers,onMove,onDragging}: {
  placements:PlacedItem[];shelfControllers:Record<ShelfId,THREE.Object3D|null>;
  onMove:(id:number,x:number,z:number)=>void;onDragging:(dragging:boolean)=>void;
}) {
  const setDragging=(id:number|null)=>{onDragging(id!==null)}
  return <>{placements.map(p=><ItemInstance key={p.id} placement={p} shelfControllers={shelfControllers} setDragging={setDragging} onMove={onMove}/>)}</>
}
