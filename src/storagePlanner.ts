import type {PlacedItem,ShelfId,StorageItemId} from './StorageItems'
import {findCatalog} from './StorageItems'

// These are prototype rail positions, not certified appliance mounting holes.
export const SHELF_BASE:Record<ShelfId,number>={1:1.033803,2:1.298579,3:1.542256}
export const SHELF_MAX:Record<ShelfId,number>={1:1.033803,2:1.52,3:1.69}
export type ShelfLayout=Record<ShelfId,number>
const CABINET_CEILING=1.82
const CLEARANCE=.032
const ABOVE_TOP=.045
// Reserve a margin inside the actual glass shelf and the side walls.
export const SHELF_AREA_WIDTH=.72
export const SHELF_AREA_DEPTH=.43
const GAP=.018

function touches(a:PlacedItem,b:PlacedItem):boolean {
  if(a.shelf!==b.shelf)return false
  const one=findCatalog(a.item),two=findCatalog(b.item)
  return Math.abs(a.x-b.x)*SHELF_AREA_WIDTH < (one.footprint+two.footprint)/2+GAP &&
         Math.abs(a.z-b.z)*SHELF_AREA_DEPTH < (one.depth+two.depth)/2+GAP
}
function inside(p:PlacedItem):boolean {
  const item=findCatalog(p.item)
  const centerX=p.x*SHELF_AREA_WIDTH, centerZ=p.z*SHELF_AREA_DEPTH
  return centerX-item.footprint/2>=GAP && centerX+item.footprint/2<=SHELF_AREA_WIDTH-GAP &&
         centerZ-item.depth/2>=GAP && centerZ+item.depth/2<=SHELF_AREA_DEPTH-GAP
}
export function isMoveValid(placements:PlacedItem[],id:number,x:number,z:number):boolean {
  const original=placements.find(p=>p.id===id)
  if(!original)return false
  const candidate={...original,x,z}
  return inside(candidate)&&placements.every(p=>p.id===id||!touches(p,candidate))
}
export function layoutFor(placements:PlacedItem[]):{layout:ShelfLayout,error:string|null} {
  const maxHeight=(s:ShelfId)=>Math.max(0,...placements.filter(p=>p.shelf===s).map(p=>findCatalog(p.item).approximateHeight))
  const first=SHELF_BASE[1]
  const second=Math.max(SHELF_BASE[2],first+maxHeight(1)+CLEARANCE)
  const third=Math.max(SHELF_BASE[3],second+maxHeight(2)+CLEARANCE)
  const layout:ShelfLayout={1:first,2:second,3:third}
  if(second>SHELF_MAX[2] || third>SHELF_MAX[3] || third+maxHeight(3)+ABOVE_TOP>CABINET_CEILING)
    return {layout,error:'Not enough vertical space for this combination. Try a different shelf or smaller item.'}
  for (const p of placements){
    if(!inside(p))return {layout,error:'Item would extend beyond the shelf edges.'}
    if(placements.some(q=>q.id!==p.id && touches(q,p)))return {layout,error:'Items would overlap. Select another shelf or remove an item.'}
  }
  return {layout,error:null}
}
export function addPlacement(current:PlacedItem[],item:StorageItemId,shelf:ShelfId):{placements:PlacedItem[];error:string|null}{
  const nextId=Math.max(0,...current.map(p=>p.id))+1
  // Search actual free rectangles from the middle out. Supports many small
  // bottles; no arbitrary four-items-per-shelf restriction.
  const candidates:{x:number;z:number;score:number}[]=[]
  for(let iz=3;iz<=97;iz+=3)for(let ix=3;ix<=97;ix+=3){
    const x=ix/100,z=iz/100
    candidates.push({x,z,score:Math.abs(z-.49)*.8+Math.abs(x-.5)*.7})
  }
  candidates.sort((a,b)=>a.score-b.score)
  for(const c of candidates){
    const added={id:nextId,item,shelf,x:c.x,z:c.z}
    if(!inside(added)||current.some(other=>touches(other,added)))continue
    const placements=[...current,added]
    if(!layoutFor(placements).error)return {placements,error:null}
  }
  // Distinguish shelf packing from clearance restrictions
  const hypothetical={id:nextId,item,shelf,x:.5,z:.5}
  const heightError=layoutFor([...current.filter(p=>p.shelf!==shelf),hypothetical]).error
  return {placements:current,error:heightError||'This shelf is full for the selected item size. Choose another shelf or remove an item.'}
}
