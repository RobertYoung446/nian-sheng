type GraphItem = { id: string; tags: string[]; intent?: string };
export function layoutGraphPoints(ideas: GraphItem[], width: number, height: number) {
  const columns = width < 650 ? 1 : Math.min(3, Math.max(1, ideas.length));
  const visibleRows = Math.min(3, Math.ceil(ideas.length / columns));
  return ideas.map((idea, index) => ({
    id: idea.id,
    x: width / 2 + ((index % columns) - (columns - 1) / 2) * Math.min(300, (width - 40) / columns),
    y: Math.max(220, height / 2 - (visibleRows - 1) * 95) + Math.floor(index / columns) * 190,
  }));
}
export function localGraphEdges(ideas: GraphItem[]) {
  const edges: {sourceId:string;targetId:string;type:string;reason:string;strength:number}[] = [];
  for (let i = 0; i < ideas.length; i++) for (let j = i + 1; j < ideas.length; j++) {
    const shared = ideas[i].tags.filter(tag => ideas[j].tags.includes(tag));
    const sameIntent = ideas[i].intent && ideas[i].intent !== '探索' && ideas[i].intent === ideas[j].intent;
    if (shared.length || sameIntent) edges.push({sourceId:ideas[i].id,targetId:ideas[j].id,type:shared.length ? '共同标签' : '相同方向',reason:shared.length ? `共享标签：${shared.join('、')}` : `同属${ideas[i].intent}方向`,strength:shared.length ? 0.68 : 0.4});
  }
  return edges.slice(0,80);
}
