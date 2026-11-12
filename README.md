# Havells Refrigerator Configurator V14 — Studio & Storage Refinement

## Launch
Run `npm.cmd install` then `npm.cmd run dev` inside this folder on Windows.

## Changes from V13
- Larger interactive 3D viewer, compact configuration sidebar, expandable door, features and quality controls.
- Metallic Black default and reset.
- Bottle PET plastic no longer uses the source GLB IOR 10.02. Labels are matte; caps have natural plastic highlights.
- Cookware is satin brushed metal (less dark/chrome), handles are warmer; food containers have subtle plastic bodies and opaque lids.
- Items sit on the GLASS shelf top, not on the raised metal frame bounding box.
- Collision-aware footprint packing and drag restrictions preserved; calibrated free-space rectangle remains a conservative prototype estimate.
- Preserves updated refrigerator.glb and storage_items.glb without altering either source asset.

## Limitations
Models and light conditions still need real-browser review. Accurate shelf mounting stops, wall collisions and measured appliance dimensions are not verified. This is a 3D demonstration, not a certified storage capacity calculator.
