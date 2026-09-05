// Same uncompressed head field and y mapping as the offline sculpt, used only
// to test the posed distal surface. A value below 1 is inside the head field.
export function sculptHeadMetric(x, worldY, z) {
  let y=(worldY-.0072)/.9;
  for(let k=0;k<6;k++){
    const t=Math.max(0,Math.min(1,(y-.07)/2.23));
    const transformed=(y-.12*t*t*(3-2*t))*.9+.0072;
    y+=(worldY-transformed)/.86;
  }
  const radius=1+.035*Math.exp(-(((y-2.36)/.35)**2)),cheek=.1*Math.exp(-(((y-2.13)/.30)**2));
  return (x/radius)**2+((y-2.58)/.81)**2+((z-.05-cheek)/.79)**2;
}

export function headRestMatrix(mesh) {
  const i=mesh.skeleton.bones.findIndex(b=>b.name==='head');
  return mesh.skeleton.boneInverses[i].clone().invert().multiply(mesh.skeleton.bones[i].matrixWorld.clone().invert());
}
