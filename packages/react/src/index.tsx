import type {EvidenceEvent,VerificationReport} from '@echoframe/core';
export function StatusBadge({status,label}:{status:string;label?:string}){
  const tone=/FAIL|INVALID|REVERT|REVOKED|NOT_DELIVERED/.test(status)?'bad':/UNKNOWN|PENDING|UNVERIFIED|EXPIRED|MISSING/.test(status)?'unknown':/PASS|VALID|SETTLED|PROVEN/.test(status)?'good':'neutral';
  return <span className={`status status-${tone}`}><span aria-hidden="true">{tone==='good'?'✓':tone==='bad'?'×':tone==='unknown'?'?':'○'}</span> {label??status.replaceAll('_',' ')}</span>;
}
export function VerdictAxes({report}:{report:VerificationReport}){
  return <div className="axes"><div><span className="eyebrow">AUTHORITY</span><StatusBadge status={report.authorityStatus}/></div><div><span className="eyebrow">MONEY · RECORDED</span><StatusBadge status={report.financialStatus}/></div><div><span className="eyebrow">WORK · LOCAL CHECKS</span><StatusBadge status={report.deliveryStatus}/></div></div>;
}
export function EvidenceTimeline({events,selectedId,onSelect}:{events:readonly EvidenceEvent[];selectedId?:string|undefined;onSelect?:(event:EvidenceEvent)=>void}){
  return <ol className="evidence-timeline">{events.map(event=><li key={event.id}><button type="button" aria-pressed={selectedId===event.id} onClick={()=>onSelect?.(event)}><span className="event-track" aria-hidden="true"/><span><span className="eyebrow">{event.index.toString().padStart(2,'0')} · {event.timestampProvenance.replaceAll('_',' ')}</span><strong>{event.type}</strong><time dateTime={event.at}>{event.at.slice(11,23)}</time></span></button></li>)}</ol>;
}
