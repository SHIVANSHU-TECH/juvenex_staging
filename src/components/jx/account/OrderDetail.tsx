'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { juvenexPortalApi, type PortalApiResponse } from '@/lib/api/juvenex-portal'
import { SpinnerIcon } from '@/components/jx/icons'
import { asArray, asRecord, formatDate, friendlyError, hasSession, requireSuccess, statusTone, text, type JsonRecord } from './portal-utils'
import { fetchPendingForms, hasIntakeCta, INTAKE_ENABLED } from '@/lib/jx/intake'
import { saveIntakeReturnTo } from '@/lib/jx/pending-add'
import type { PendingForm } from '@/lib/juvenex/schemas'
import s from './portal.module.css'

type DetailData = { order:JsonRecord; timeline:JsonRecord[]; enrollments:JsonRecord[]; messages:JsonRecord[] }

export function OrderDetail({ orderId }: { orderId:string }) {
  const [data,setData] = useState<DetailData | null>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [shippingOpen,setShippingOpen] = useState(false)
  const [cancelTarget,setCancelTarget] = useState<JsonRecord | null>(null)
  const [notice,setNotice] = useState('')
  const [intakeForm, setIntakeForm] = useState<PendingForm | undefined>()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    if (!hasSession()) { setError('Please sign in to view your Juvenex account.'); setLoading(false); return }
    try {
      const orderRes = await juvenexPortalApi.getOrder(orderId)
      requireSuccess(orderRes,'Order could not be loaded.')
      const [historyResult, enrollmentResult, messageResult] = await Promise.allSettled([
        juvenexPortalApi.getOrderHistory(orderId),
        juvenexPortalApi.getEnrollment(orderId),
        juvenexPortalApi.patientMessages(orderId),
      ])
      const historyRes = historyResult.status === 'fulfilled' ? historyResult.value : null
      const enrollmentRes = enrollmentResult.status === 'fulfilled' ? enrollmentResult.value : null
      const messageRes = messageResult.status === 'fulfilled' ? messageResult.value : null
      setData({
        order:asRecord(orderRes),
        timeline: historyRes ? asArray(historyRes.timeline) : [],
        enrollments: enrollmentRes ? asArray(enrollmentRes.enrollments) : [],
        messages: messageRes ? extractMessages(messageRes) : [],
      })
      if ([historyResult, enrollmentResult, messageResult].some((result) => result.status === 'rejected')) {
        setNotice('Order loaded. Some care details are temporarily unavailable; you can retry shortly.')
      }
    } catch (cause) { setError(friendlyError(cause)) }
    finally { setLoading(false) }
  },[orderId])
  useEffect(() => { void load() },[load])

  useEffect(() => {
    if (!INTAKE_ENABLED || !hasSession()) return
    let active = true
    void fetchPendingForms(orderId).then((forms) => {
      if (!active) return
      setIntakeForm(forms.find((form) => form.order_id === orderId) ?? forms[0])
    })
    return () => { active = false }
  }, [orderId])

  if (loading) return <div className={s.stack} aria-busy="true" aria-label="Loading order"><div className={s.skeleton}/><div className={s.skeleton}/><div className={s.skeleton}/></div>
  if (error || !data) return <section className={`jx-card ${s.state}`}><div className={s.stateInner}><h2 className="jx-display">Order unavailable</h2><p>{error || 'This order could not be found.'}</p><div className={s.actions} style={{justifyContent:'center'}}><button className="jx-btn jx-btn-primary" onClick={() => void load()}>Try again</button><Link className="jx-btn jx-btn-ghost" href={/sign in/i.test(error) ? `/login?next=${encodeURIComponent(`/store/account/orders/${orderId}`)}` : '/store/account/orders'}>{/sign in/i.test(error) ? 'Sign in' : 'Back to orders'}</Link></div></div></section>

  const status = text(data.order.order_status_meaning,'Processing')
  return <>
    {notice ? <div className={s.notice} role="status" style={{marginBottom:16}}>{notice}</div> : null}
    <IntakePanel form={intakeForm} />
    <div className={s.detailGrid}>
      <div className={s.stack}>
        <section className={`jx-card ${s.panel}`} aria-labelledby="summary-title">
          <div className={s.sectionHead}><div><h2 id="summary-title">Order summary</h2><p>Current status and delivery information</p></div><span className={s.status} data-tone={statusTone(status)}>{status.replaceAll('_',' ')}</span></div>
          <dl className={s.facts}>
            <Fact label="Order number" value={`#${text(data.order.order_id,orderId)}`} />
            <Fact label="Order type" value={text(data.order.order_type,'One-time').replaceAll('_',' ')} />
            <Fact label="Tracking number" value={text(data.order.tracking_number,'Not shipped yet')} />
            <Fact label="Next billing date" value={formatDate(asRecord(data.order.enrollment).next_bill_date)} />
          </dl>
          <div className={s.actions}><button className="jx-btn jx-btn-ghost" onClick={() => setShippingOpen((value) => !value)} aria-expanded={shippingOpen}>Update shipping address</button></div>
          {shippingOpen ? <ShippingForm orderId={orderId} onSuccess={() => { setShippingOpen(false); setNotice('Shipping address updated successfully.') }} /> : null}
        </section>
        <Timeline items={data.timeline} />
        <Messages orderId={orderId} initial={data.messages} />
      </div>
      <aside className={s.stack} aria-label="Subscription details">
        <section className={`jx-card ${s.panel}`}>
          <div className={s.sectionHead}><div><h2>Subscription</h2><p>Recurring treatment enrollment</p></div></div>
          {data.enrollments.length ? data.enrollments.map((item,index) => <div className={s.enrollment} key={text(item.subscription_id,String(index))}>
            <h3>{text(item.product_name,'Treatment plan')}</h3><p><strong>Status:</strong> {text(item.status,'Active')}</p><p><strong>Next bill:</strong> {formatDate(item.next_bill_date)}</p><p>{text(item.billing_model,'Recurring')}</p>
            <button className={s.danger} type="button" onClick={() => setCancelTarget(item)}>Cancel subscription</button>
          </div>) : <p style={{margin:0,color:'var(--jx-muted)',lineHeight:1.5}}>This order does not have an active subscription.</p>}
        </section>
        <section className={`jx-tile-dark ${s.panel}`}><span className="jx-eyebrow" style={{color:'#d7ddcf'}}>Need help?</span><h2 className="jx-display" style={{margin:'8px 0',fontSize:25}}>Your care team is here</h2><p style={{margin:'0 0 16px',opacity:.82,lineHeight:1.5,fontSize:14}}>Use secure messages below for treatment or fulfillment questions.</p><a href="#care-messages" className="jx-btn jx-btn-onDark">Message care team</a></section>
      </aside>
    </div>
    {cancelTarget ? <CancelDialog orderId={orderId} enrollment={cancelTarget} onClose={() => setCancelTarget(null)} onSuccess={() => { setCancelTarget(null); setNotice('Your subscription has been cancelled.'); void load() }} /> : null}
  </>
}

function IntakePanel({ form }: { form?: PendingForm }) {
  if (!form) return null
  if (hasIntakeCta(form)) {
    return (
      <section className={`jx-card ${s.panel}`} style={{ marginBottom: 16 }} aria-label="Intake form">
        <div className={s.sectionHead}>
          <div>
            <h2>Intake form</h2>
            <p>Your prescribing doctor needs this to review your order.</p>
          </div>
        </div>
        <div className={s.actions}>
          <Link
            className="jx-btn jx-btn-primary"
            href={`/store/intake?order_id=${encodeURIComponent(form.order_id)}`}
            onClick={() =>
              saveIntakeReturnTo(`/store/account/orders/${encodeURIComponent(form.order_id)}`)
            }
          >
            {form.action === 'check_in' ? 'Complete check-in' : 'Complete intake'}
          </Link>
        </div>
      </section>
    )
  }
  if (form.action === 'pending') {
    return (
      <section className={`jx-card ${s.panel}`} style={{ marginBottom: 16 }} aria-label="Intake form">
        <div className={s.sectionHead}>
          <div>
            <h2>Intake form</h2>
            <p>Your intake form isn&rsquo;t ready yet. Check back shortly.</p>
          </div>
        </div>
      </section>
    )
  }
  return null
}

function Fact({label,value}:{label:string;value:string}) { return <div className={s.fact}><dt>{label}</dt><dd>{value}</dd></div> }

function Timeline({items}:{items:JsonRecord[]}) { return <section className={`jx-card ${s.panel}`} aria-labelledby="timeline-title"><div className={s.sectionHead}><div><h2 id="timeline-title">Care timeline</h2><p>Clinical and fulfillment progress</p></div></div>{items.length ? <ol className={s.timeline}>{items.map((item,index) => <li key={`${text(item.title)}-${index}`}><span className={s.timelineIcon} aria-hidden="true">{text(item.icon,'✓')}</span><div><h3>{text(item.title,'Update')}</h3><time>{formatDate(item.date)}</time><p>{text(item.description,'Your order has been updated.')}</p></div></li>)}</ol> : <p style={{margin:0,color:'var(--jx-muted)'}}>Timeline updates will appear here as your care progresses.</p>}</section> }

function ShippingForm({orderId,onSuccess}:{orderId:string;onSuccess:()=>void}) {
  const [values,setValues]=useState({shipping_address:'',shipping_city:'',shipping_state:'',shipping_zip:''}); const [busy,setBusy]=useState(false); const [error,setError]=useState('')
  async function submit(event:React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { requireSuccess(await juvenexPortalApi.updateShippingAddress({order_id:orderId,...values}), 'Address could not be updated.'); onSuccess() } catch(cause) { setError(friendlyError(cause)) } finally { setBusy(false) } }
  return <form onSubmit={submit} style={{marginTop:20}}><div className={s.formGrid}>
    <Field label="Street address" name="shipping_address" value={values.shipping_address} onChange={(value)=>setValues({...values,shipping_address:value})} autoComplete="street-address" full />
    <Field label="City" name="shipping_city" value={values.shipping_city} onChange={(value)=>setValues({...values,shipping_city:value})} autoComplete="address-level2" />
    <Field label="State (2 letters)" name="shipping_state" value={values.shipping_state} onChange={(value)=>setValues({...values,shipping_state:value.toUpperCase().slice(0,2)})} autoComplete="address-level1" pattern="[A-Za-z]{2}" maxLength={2} />
    <Field label="ZIP code" name="shipping_zip" value={values.shipping_zip} onChange={(value)=>setValues({...values,shipping_zip:value})} autoComplete="postal-code" />
  </div>{error ? <div className={s.error} role="alert" style={{marginTop:12}}>{error}</div> : null}<div className={s.actions}><button className="jx-btn jx-btn-primary" disabled={busy}>{busy ? <><SpinnerIcon/>Saving…</>:'Save address'}</button></div></form>
}

function Field({label,name,value,onChange,full,...input}:{label:string;name:string;value:string;onChange:(value:string)=>void;full?:boolean} & Omit<React.InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'>) { return <div className={`${s.field} ${full?s.full:''}`}><label htmlFor={name}>{label}</label><input className="jx-input" id={name} name={name} value={value} onChange={(event)=>onChange(event.target.value)} required {...input}/></div> }

function CancelDialog({orderId,enrollment,onClose,onSuccess}:{orderId:string;enrollment:JsonRecord;onClose:()=>void;onSuccess:()=>void}) {
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const cancelRef=useRef<HTMLButtonElement>(null)
  useEffect(()=>{ cancelRef.current?.focus(); const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose()}; document.addEventListener('keydown',onKey); return()=>document.removeEventListener('keydown',onKey)},[busy,onClose])
  async function confirm(){setBusy(true);setError('');try{requireSuccess(await juvenexPortalApi.cancelEnrollment({order_id:orderId,subscription_id:text(enrollment.subscription_id,'')}),'Subscription could not be cancelled.');onSuccess()}catch(cause){setError(friendlyError(cause));setBusy(false)}}
  return <div className={s.dialogScrim} role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)onClose()}}><div className={`jx-card ${s.dialog}`} role="alertdialog" aria-modal="true" aria-labelledby="cancel-title" aria-describedby="cancel-description"><h2 id="cancel-title" className="jx-display">Cancel subscription?</h2><p id="cancel-description">Future recurring orders for {text(enrollment.product_name,'this treatment')} will stop. This does not cancel an order already processing.</p>{error?<div className={s.error} role="alert" style={{marginTop:14}}>{error}</div>:null}<div className={s.actions}><button ref={cancelRef} type="button" className="jx-btn jx-btn-ghost" onClick={onClose} disabled={busy}>Keep subscription</button><button type="button" className="jx-btn jx-btn-primary" onClick={()=>void confirm()} disabled={busy}>{busy?'Cancelling…':'Yes, cancel'}</button></div></div></div>
}

function extractMessages(response:PortalApiResponse) { const root=asRecord(response.data); const nested=asRecord(root.data); return asArray(Array.isArray(root.data)?root.data:Array.isArray(nested.data)?nested.data:response.messages) }

function Messages({orderId,initial}:{orderId:string;initial:JsonRecord[]}) {
  const [messages,setMessages]=useState(initial); const [textValue,setTextValue]=useState(''); const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const fileRef=useRef<HTMLInputElement>(null)
  async function refresh(){const response=await juvenexPortalApi.patientMessages(orderId); if(response.status!==0)setMessages(extractMessages(response))}
  async function submit(event:React.FormEvent){event.preventDefault();if(!textValue.trim()&&!file){setError('Write a message or attach a file.');return}if(file&&file.size>10*1024*1024){setError('Please choose a file smaller than 10 MB.');return}setBusy(true);setError('');try{requireSuccess(await juvenexPortalApi.sendPatientMessage({order_id:orderId,text:textValue.trim()||undefined,file:file||undefined}),'Message could not be sent.');setTextValue('');setFile(null);if(fileRef.current)fileRef.current.value='';await refresh()}catch(cause){setError(friendlyError(cause))}finally{setBusy(false)}}
  return <section id="care-messages" className={`jx-card ${s.panel}`} aria-labelledby="messages-title"><div className={s.sectionHead}><div><h2 id="messages-title">Secure messages</h2><p>Message your Juvenex care team about this order</p></div></div>
    <div className={s.messages} aria-live="polite">{messages.length?messages.map((message,index)=>{const body=text(message.text??message.body??message.message,'');const own=String(message.channel??message.sender_type??'').toLowerCase().includes('patient');return <div className={s.bubble} data-own={own} key={text(message.id,String(index))}>{body||'Attachment'}<time>{formatDate(message.created_at??message.createdAt??message.time,true)}</time></div>}):<p style={{color:'var(--jx-muted)',fontSize:14}}>No messages yet. Start a secure conversation below.</p>}</div>
    <form onSubmit={submit} style={{marginTop:18}}><div className={s.field}><label htmlFor="care-message">Your message</label><textarea id="care-message" className="jx-input" maxLength={10000} value={textValue} onChange={(event)=>setTextValue(event.target.value)} placeholder="How can your care team help?" /></div><div className={s.file}><label htmlFor="care-file" style={{fontWeight:600}}>Optional image or PDF</label><input ref={fileRef} id="care-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event)=>setFile(event.target.files?.[0]??null)} style={{display:'block',marginTop:7,maxWidth:'100%'}} />{file?<span>Selected: {file.name}</span>:null}</div>{error?<div className={s.error} role="alert" style={{marginTop:12}}>{error}</div>:null}<div className={s.actions}><button className="jx-btn jx-btn-primary" disabled={busy}>{busy?<><SpinnerIcon/>Sending…</>:'Send securely'}</button></div></form>
  </section>
}
