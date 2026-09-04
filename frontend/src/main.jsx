import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const CONTACT={
 email:import.meta.env.VITE_CONTACT_EMAIL||'novamsawt@gmail.com',
 phone:import.meta.env.VITE_CONTACT_PHONE||'',
 whatsapp:import.meta.env.VITE_WHATSAPP_NUMBER||'254785153393',
 instagram:'https://www.instagram.com/JazaMart_Kenya/',
 facebook:'',
 x:'https://x.com/JazaMart_Kenya'
};
const whatsappUrl=CONTACT.whatsapp?`https://wa.me/${CONTACT.whatsapp.replace(/\D/g,'')}`:'';
const money=n=>`KSh ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const token=()=>localStorage.getItem('jazamart_token');
const api=async(path,options={})=>{const r=await fetch(`${API}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{}),...(token()?{Authorization:`Bearer ${token()}`}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'Request failed');return d};
const statuses=['pending','paid','processing','shipped','out_for_delivery','delivered','cancelled'];
const label=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const fallback=[{id:'demo-1',name:'Wireless Headphones',price:2499,category_name:'Electronics',emoji:'🎧',stock:20},{id:'demo-2',name:'Smart Watch',price:3499,category_name:'Electronics',emoji:'⌚',stock:15},{id:'demo-3',name:'Running Sneakers',price:4200,category_name:'Fashion',emoji:'👟',stock:12},{id:'demo-4',name:'Backpack',price:1800,category_name:'Fashion',emoji:'🎒',stock:25}];
function App(){
 const [products,setProducts]=useState(fallback),[categoriesData,setCategoriesData]=useState([]),[query,setQuery]=useState(''),[cat,setCat]=useState('All'),[cart,setCart]=useState([]),[user,setUser]=useState(null);
 const [modal,setModal]=useState(null),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[orders,setOrders]=useState([]),[tracking,setTracking]=useState([]),[selectedOrder,setSelectedOrder]=useState(null),[reviews,setReviews]=useState(null),[reviewForm,setReviewForm]=useState({rating:5,comment:''}),[mpesaPhone,setMpesaPhone]=useState(''),[payStatus,setPayStatus]=useState('idle');
 const [admin,setAdmin]=useState(null),[seller,setSeller]=useState(null),[customer,setCustomer]=useState(null),[form,setForm]=useState({name:'',email:'',password:'',role:'customer'}),[mode,setMode]=useState('login');
 const [addresses,setAddresses]=useState([]),[wishlist,setWishlist]=useState([]),[profile,setProfile]=useState({name:'',email:''}),[address,setAddress]=useState({full_name:'',phone:'',county:'',town:'',address_line:''}),[selectedAddress,setSelectedAddress]=useState(''),[paymentMethod,setPaymentMethod]=useState('mpesa');
 const [installPrompt,setInstallPrompt]=useState(null),[editing,setEditing]=useState(null),[productForm,setProductForm]=useState({name:'',description:'',price:'',stock:'',category_id:'',image_url:''});
 useEffect(()=>{
  const handler=e=>{e.preventDefault();setInstallPrompt(e)}; window.addEventListener('beforeinstallprompt',handler);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  return ()=>window.removeEventListener('beforeinstallprompt',handler);
 },[]);
 useEffect(()=>{Promise.all([fetch(`${API}/api/products`).then(r=>r.ok?r.json():fallback),fetch(`${API}/api/categories`).then(r=>r.ok?r.json():[])]).then(([p,c])=>{setProducts(p);setCategoriesData(c)}).catch(()=>{});const u=localStorage.getItem('jazamart_user');if(u&&token()){setUser(JSON.parse(u));setProfile({name:JSON.parse(u).name||'',email:JSON.parse(u).email||''});}const c=localStorage.getItem('jazamart_cart');if(c)setCart(JSON.parse(c));},[]);
 useEffect(()=>localStorage.setItem('jazamart_cart',JSON.stringify(cart)),[cart]);
 const categories=['All',...new Set(products.map(p=>p.category_name).filter(Boolean))],filtered=useMemo(()=>products.filter(p=>(cat==='All'||p.category_name===cat)&&p.name.toLowerCase().includes(query.toLowerCase())),[products,query,cat]);
 const total=cart.reduce((s,p)=>s+Number(p.price)*p.quantity,0),count=cart.reduce((s,p)=>s+p.quantity,0);
 const flash=m=>{setMessage(m);setTimeout(()=>setMessage(''),3500)};
 function add(p){if(String(p.id).startsWith('demo-')||!p.stock)return;setCart(c=>{const x=c.find(i=>i.id===p.id);return x?c.map(i=>i.id===p.id?{...i,quantity:Math.min(i.quantity+1,p.stock)}:i):[...c,{...p,quantity:1}]});setModal('cart')}
 function change(id,d){setCart(c=>c.flatMap(i=>i.id!==id?[i]:[{...i,quantity:i.quantity+d}].filter(x=>x.quantity>0)))}
 function logout(){localStorage.removeItem('jazamart_user');localStorage.removeItem('jazamart_token');setUser(null);setAdmin(null);setSeller(null);setCustomer(null);setOrders([]);setWishlist([]);flash('Logged out.');}
 async function submit(e){e.preventDefault();setLoading(true);try{const body=mode==='login'?{email:form.email,password:form.password}:{name:form.name,email:form.email,password:form.password,role:form.role};const d=await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify(body)});localStorage.setItem('jazamart_user',JSON.stringify(d.user));localStorage.setItem('jazamart_token',d.token);setUser(d.user);setModal(null);flash(`Welcome, ${d.user.name}.`);}catch(e){flash(e.message)}finally{setLoading(false)}}
 async function openOrders(){if(!user){setMode('login');setModal('auth');return}try{setOrders(await api('/api/orders'));setModal('orders')}catch(e){flash(e.message)}}
 async function track(o){try{setSelectedOrder(o);setTracking(await api(`/api/orders/${o.id}/tracking`));setModal('tracking')}catch(e){flash(e.message)}}
 async function openCheckout(){if(!user){setMode('login');setModal('auth');return}try{const a=await api('/api/addresses');setAddresses(a);setSelectedAddress(a[0]?.id||'');setModal('checkout')}catch(e){flash(e.message)}}
 async function saveAddress(){try{const a=await api('/api/addresses',{method:'POST',body:JSON.stringify(address)});setAddresses(x=>[a,...x]);setSelectedAddress(a.id);setAddress({full_name:'',phone:'',county:'',town:'',address_line:''});flash('Address saved.')}catch(e){flash(e.message)}}
 function pollPayment(orderId){let attempts=0;const iv=setInterval(async()=>{attempts++;try{const r=await api(`/api/orders/${orderId}/payment-status`);if(r.status==='paid'){clearInterval(iv);setPayStatus('paid');flash('Payment received! ✅')}else if(r.status==='failed'){clearInterval(iv);setPayStatus('failed')}}catch(e){}if(attempts>20){clearInterval(iv);setPayStatus(s=>s==='pending'?'timeout':s)}},3000)}
 async function placeOrder(){
  if(!selectedAddress)return flash('Select or save a delivery address first.');
  if(paymentMethod==='mpesa'&&!mpesaPhone.trim())return flash('Enter the M-Pesa phone number to pay with.');
  setLoading(true);
  try{
   const d=await api('/api/orders',{method:'POST',body:JSON.stringify({address_id:selectedAddress,payment_method:paymentMethod,items:cart.map(i=>({product_id:i.id,quantity:i.quantity}))})});
   setCart([]);
   if(paymentMethod==='mpesa'){
    setModal('mpesaPay');setPayStatus('pending');
    try{await api('/api/mpesa/stkpush',{method:'POST',body:JSON.stringify({order_id:d.id,phone:mpesaPhone})});pollPayment(d.id)}
    catch(e){setPayStatus('failed');flash(e.message)}
   }else{
    setModal(null);flash(`Order ${String(d.id).slice(0,8)} created.`);
   }
  }catch(e){flash(e.message)}finally{setLoading(false)}
 }
 return <div><header><div className="logo">Jaza<span>Mart</span></div><nav><a href="#shop">Shop</a>{user&&<a href="#orders" onClick={e=>{e.preventDefault();openOrders()}}>Orders</a>}</nav><div className="actions">{installPrompt&&<button className="secondary" onClick={async()=>{const e=installPrompt;setInstallPrompt(null);await e.prompt();await e.userChoice;}}>📲 Install App</button>}{user?<><span className="user">Hi, {user.name}</span><button className="user" onClick={logout}>Logout</button></>:<button className="login" onClick={()=>{setMode('login');setModal('auth')}}>Login / Register</button>}<button className="cart" onClick={()=>setModal('cart')}>🛒 Cart ({count})</button></div></header>
 <section className="hero"><div><p className="eyebrow">KENYA'S ONLINE MARKETPLACE</p><h1>Everything you need.<br/><span>All in one place.</span></h1><p>Shop products from trusted sellers across Kenya.</p><button onClick={()=>document.getElementById('shop').scrollIntoView({behavior:'smooth'})}>Shop Now</button></div><div className="hero-card">🛍️<strong>JazaMart</strong><small>Shop • Sell • Deliver</small></div></section>
 <main id="shop"><div className="toolbar"><h2>Popular Products</h2><input placeholder="Search products..." value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="categories">{categories.map(c=><button className={cat===c?'active':''} onClick={()=>setCat(c)} key={c}>{c}</button>)}</div><div className="grid">{filtered.map(p=><article className="product" key={p.id}><div className="pic">{p.image_url?<img src={p.image_url} alt=""/>:(p.emoji||'📦')}</div><small>{p.category_name||'General'}</small><h3>{p.name}</h3><div className="row"><div><b>{money(p.price)}</b><small className="stock"> · {p.stock} in stock</small></div><button disabled={!p.stock||String(p.id).startsWith('demo-')} onClick={()=>add(p)}>{!p.stock?'Out of stock':String(p.id).startsWith('demo-')?'Demo':'Add to cart'}</button></div></article>)}</div></main>
 <div className="cartbar">{count?<>🛒 {count} item(s) · <b>{money(total)}</b><button onClick={()=>setModal('cart')}>View Cart</button></>:<>Your cart is empty — add a product to begin.</>}</div>
 {modal&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><div className="modal"><button className="close" onClick={()=>setModal(null)}>×</button>
 {modal==='auth'&&<form onSubmit={submit}><h2>{mode==='login'?'Welcome back':'Create your account'}</h2>{mode==='register'&&<input placeholder="Full name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>}<input type="email" placeholder="Email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input type="password" placeholder="Password (8+ characters)" minLength="8" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>{mode==='register'&&<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="customer">Shop as Customer</option><option value="seller">Register as Seller</option></select>}<button className="primary" disabled={loading}>{loading?'Please wait…':mode==='login'?'Login':'Register'}</button><p className="switch" onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Need an account? Register':'Already have an account? Login'}</p></form>}
 {modal==='cart'&&<><h2>Your Cart</h2>{cart.length?cart.map(i=><div className="cartitem" key={i.id}><b>{i.name}</b><span><button onClick={()=>change(i.id,-1)}>−</button> {i.quantity} <button onClick={()=>change(i.id,1)}>+</button></span><b>{money(i.price*i.quantity)}</b></div>):<p>Your cart is empty.</p>}<div className="carttotal">Total <b>{money(total)}</b></div><button className="primary" disabled={!cart.length} onClick={openCheckout}>Proceed to Checkout</button></>}
 {modal==='checkout'&&<><h2>Secure Checkout</h2>{addresses.length>0&&<><label>Saved delivery address</label><select value={selectedAddress} onChange={e=>setSelectedAddress(e.target.value)}><option value="">Choose</option>{addresses.map(a=><option key={a.id} value={a.id}>{a.full_name} · {a.town}, {a.county}</option>)}</select></>}<div className="addressbox"><h3>New address</h3>{['full_name','phone','county','town','address_line'].map(k=><input key={k} placeholder={{full_name:'Full name',phone:'Phone',county:'County',town:'Town',address_line:'Address / estate / building'}[k]} value={address[k]} onChange={e=>setAddress({...address,[k]:e.target.value})}/>) }<button className="secondary" onClick={saveAddress}>Save address</button></div><label>Payment</label><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="mpesa">M-Pesa</option><option value="cash_on_delivery">Cash on delivery</option></select>{paymentMethod==='mpesa'&&<input placeholder="M-Pesa phone e.g. 0712345678" value={mpesaPhone} onChange={e=>setMpesaPhone(e.target.value)}/>}<button className="primary" disabled={loading||!selectedAddress} onClick={placeOrder}>{loading?'Placing…':`Place Order · ${money(total)}`}</button></>}
 {modal==='mpesaPay'&&<><h2>M-Pesa Payment</h2>{payStatus==='pending'&&<p>📲 Check your phone ({mpesaPhone}) and enter your M-Pesa PIN to complete payment…</p>}{payStatus==='paid'&&<p>✅ Payment received! Your order is confirmed.</p>}{payStatus==='failed'&&<p>❌ Payment failed or was cancelled. You can try again from My Orders.</p>}{payStatus==='timeout'&&<p>⏳ Still waiting for confirmation — check status later in My Orders.</p>}<button className="primary" onClick={()=>{setModal(null);openOrders();}}>Close</button></>}
 {modal==='orders'&&<><h2>My Orders</h2>{orders.length?orders.map(o=><div className="order" key={o.id}><div className="row"><b>#{String(o.id).slice(0,8)}</b><span className="status">{label(o.status)}</span><b>{money(o.total)}</b></div><small>{new Date(o.created_at).toLocaleString()}</small><button className="secondary" onClick={()=>track(o)}>Track delivery</button></div>):<p>No orders yet.</p>}</>}
 {modal==='tracking'&&<><h2>Delivery Tracking</h2><p>Order #{String(selectedOrder?.id).slice(0,8)}</p><div className="timeline">{statuses.map(s=>{const hit=tracking.find(x=>x.status===s);return <div className={hit?'step done':'step'} key={s}><strong>{label(s)}</strong>{hit&&<small>{new Date(hit.created_at).toLocaleString()}</small>}</div>})}</div></>}
 </div></div>}
 <footer className="siteFooter"><div className="footerGrid"><div><div className="logo footerLogo">Jaza<span>Mart</span></div><p>Shop with confidence. Need help? Reach out to JazaMart through any of our contact channels.</p></div><div><h3>Contact Us</h3><div className="contactList"><a href="mailto:novamsawt@gmail.com">✉️ <b>Email</b>: novamsawt@gmail.com</a><a href={whatsappUrl} target="_blank" rel="noopener noreferrer">💬 <b>WhatsApp</b>: 0785 153 393</a></div></div><div><h3>Follow Us</h3><div className="socialList"><a href="https://www.instagram.com/JazaMart_Kenya/" target="_blank" rel="noopener noreferrer">📸 <b>Instagram</b>: JazaMart_Kenya</a><a href="https://x.com/JazaMart_Kenya" target="_blank" rel="noopener noreferrer">𝕏 <b>X</b>: JazaMart_Kenya</a><a href="https://www.tiktok.com/@kirats254" target="_blank" rel="noopener noreferrer">🎵 <b>TikTok</b>: kirats254</a></div></div></div><div className="footerBottom">© {new Date().getFullYear()} JazaMart. All rights reserved.</div></footer>
 {message&&<div className="toast">{message}</div>}</div>}
createRoot(document.getElementById('root')).render(<App/>);
