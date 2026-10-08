
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
fs.mkdirSync(DATA_DIR, {recursive:true});
fs.mkdirSync(UPLOAD_DIR, {recursive:true});

const db = new Database(path.join(DATA_DIR, 'ken.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');


app.use(express.urlencoded({extended:true, limit:'5mb'}));
app.use(express.json({limit:'2mb'}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'KEN-change-this-secret-2026',
  resave:false,
  saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*7}
}));

const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,UPLOAD_DIR),
  filename:(req,file,cb)=>{
    const ext=path.extname(file.originalname||'').toLowerCase();
    cb(null, Date.now()+'-'+crypto.randomBytes(8).toString('hex')+ext);
  }
});
const upload = multer({
  storage,
  limits:{fileSize:100*1024*1024},
  fileFilter:(req,file,cb)=>{
    if(file.fieldname==='file') return cb(null,true);
    if(file.fieldname==='image'){
      const ok=/^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(file.mimetype);
      return cb(ok?null:new Error('ไฟล์รูปภาพไม่ถูกต้อง'),ok);
    }
    if(file.fieldname==='slip'){
      const ok=/^image\/(png|jpe?g|webp)$/i.test(file.mimetype);
      return cb(ok?null:new Error('สลิปต้องเป็นไฟล์รูปภาพ'),ok);
    }
    cb(null,true);
  }
});

const uploadSlip = multer({
  storage,
  limits:{fileSize:4*1024*1024},
  fileFilter:(req,file,cb)=>{
    const ok=/^image\/(png|jpe?g|webp)$/i.test(file.mimetype);
    cb(ok?null:new Error('สลิปต้องเป็นไฟล์ JPG, PNG หรือ WebP'), ok);
  }
});

function now(){ return new Date().toISOString(); }
function money(n){ return '฿'+Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function esc(v){
  return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function slugify(s){
  return String(s||'').toLowerCase().trim().replace(/[^a-z0-9ก-๙]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || ('item-'+Date.now());
}
function token(){return crypto.randomBytes(24).toString('hex');}
function redirectBack(req,res,fallback='/admin'){res.redirect(req.get('referer')||fallback);}
function flash(req,type,msg){req.session.flash={type,msg};}
function getFlash(req){const f=req.session.flash; delete req.session.flash; return f;}
function isLogged(req){return !!req.session.user;}
function currentUser(req){return req.session.user ? db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user.id) : null;}

function initDb(){
  db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'ทั่วไป',
    price INTEGER NOT NULL DEFAULT 0,
    old_price INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    image_url TEXT DEFAULT '',
    download_file TEXT DEFAULT '',
    featured INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'พร้อมขาย',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS product_variants(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    old_price INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    coupon_id INTEGER,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid',
    download_token TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS topups(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    slip_file TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS wallet_transactions(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    note TEXT DEFAULT '',
    ref_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS coupons(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'percent',
    value INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    min_amount INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS coupon_uses(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coupon_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(coupon_id,user_id,order_id)
  );
  CREATE TABLE IF NOT EXISTS settings(
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS categories(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS reseller_keys(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL DEFAULT 40,
    max_uses INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_reseller_keys(
    user_id INTEGER PRIMARY KEY,
    key_id INTEGER NOT NULL,
    activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(key_id) REFERENCES reseller_keys(id)
  );
  `);
  const topupCols=db.prepare('PRAGMA table_info(topups)').all().map(x=>x.name);
  if(!topupCols.includes('verify_status')) db.exec("ALTER TABLE topups ADD COLUMN verify_status TEXT NOT NULL DEFAULT 'not_checked'");
  if(!topupCols.includes('verify_message')) db.exec("ALTER TABLE topups ADD COLUMN verify_message TEXT DEFAULT ''");
  if(!topupCols.includes('trans_ref')) db.exec("ALTER TABLE topups ADD COLUMN trans_ref TEXT DEFAULT ''");
  if(!topupCols.includes('slip_amount')) db.exec("ALTER TABLE topups ADD COLUMN slip_amount REAL");
  if(!topupCols.includes('receiver_match')) db.exec("ALTER TABLE topups ADD COLUMN receiver_match INTEGER NOT NULL DEFAULT 0");
  if(!topupCols.includes('verified_at')) db.exec("ALTER TABLE topups ADD COLUMN verified_at TEXT");

  const orderCols=db.prepare('PRAGMA table_info(orders)').all().map(x=>x.name);
  if(!orderCols.includes('reseller_key_id')) db.exec('ALTER TABLE orders ADD COLUMN reseller_key_id INTEGER');
  if(!orderCols.includes('reseller_discount_percent')) db.exec('ALTER TABLE orders ADD COLUMN reseller_discount_percent INTEGER NOT NULL DEFAULT 0');

  const settings = {
    store_name:'KEN CODE STORE',
    tagline:'Source Code • Script • Website • Bot',
    announcement:'ยินดีต้อนรับสู่ KEN CODE STORE',
    contact:'ติดต่อแอดมินผ่านช่องทางที่ร้านกำหนด',
    bank_name:'กสิกรไทย',
    bank_account_name:'พงค สุขสะอาด',
    bank_account_number:'1691369036',
    currency:'KEN COIN'
  };
  const insSet=db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for(const [k,v] of Object.entries(settings)) insSet.run(k,v);
  // Payment destination requested by the store owner.
  setSetting('bank_name','กสิกรไทย');
  setSetting('bank_account_name','พงค สุขสะอาด');
  setSetting('bank_account_number','1691369036');
  db.prepare("DELETE FROM settings WHERE key='promptpay_qr'").run();

  const cat=db.prepare('INSERT OR IGNORE INTO categories(name) VALUES(?)');
  ['Source Code','Script','Website','Bot','อื่นๆ'].forEach(x=>cat.run(x));

  const adminEmail=process.env.ADMIN_EMAIL || 'admin@ken.local';
  const adminPassword=process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123';
  const existing=db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail);
  if(!existing){
    db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
      .run('KEN Admin',adminEmail,bcrypt.hashSync(adminPassword,12),'admin');
  }else{
    db.prepare("UPDATE users SET role='admin' WHERE email=?").run(adminEmail);
  }

  const count=db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if(!count){
    const p=db.prepare(`INSERT INTO products(title,slug,description,category,price,old_price,stock,image_url,featured,active,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      'PHP Shop Starter','php-shop-starter',
      'ชุดเริ่มต้นร้านค้า PHP พร้อมนำไปพัฒนาต่อ เหมาะสำหรับทดลองระบบร้านดิจิทัล',
      'Source Code',1290,1990,10,'',1,1,'พร้อมขาย'
    );
    db.prepare('INSERT INTO product_variants(product_id,name,price,old_price,stock) VALUES(?,?,?,?,?)')
      .run(p.lastInsertRowid,'Standard',1290,1990,10);
  }
}
initDb();

function setting(key, fallback=''){const r=db.prepare('SELECT value FROM settings WHERE key=?').get(key);return r?r.value:fallback;}
function setSetting(key,value){db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
function activeResellerForUser(userId){
  if(!userId) return null;
  const r=db.prepare('SELECT k.*,urk.activated_at FROM user_reseller_keys urk JOIN reseller_keys k ON k.id=urk.key_id WHERE urk.user_id=?').get(userId);
  if(!r || !r.active) return null;
  if(r.expires_at && new Date(r.expires_at)<new Date()) return null;
  if(r.max_uses>0 && r.used_count>=r.max_uses) return null;
  return r;
}
function resellerPrice(price,userId){
  const key=activeResellerForUser(userId);
  if(!key) return {price:Number(price),key:null,discount:0};
  const discount=Math.max(0,Math.min(90,Number(key.discount_percent)||0));
  return {price:Math.max(0,Math.floor(Number(price)*(100-discount)/100)),key,discount};
}
function generateResellerCode(){
  let code=''; do{code='KEN-REP-'+crypto.randomBytes(5).toString('hex').toUpperCase();}while(db.prepare('SELECT 1 FROM reseller_keys WHERE code=?').get(code)); return code;
}
function publicProduct(p){
  const vars=db.prepare('SELECT * FROM product_variants WHERE product_id=? AND active=1 ORDER BY id').all(p.id);
  return {...p,variants:vars};
}

function auth(req,res,next){
  if(!req.session.user){flash(req,'error','กรุณาเข้าสู่ระบบก่อน');return res.redirect('/login?next='+encodeURIComponent(req.originalUrl));}
  const u=currentUser(req);
  if(!u){req.session.destroy(()=>res.redirect('/login'));return;}
  req.user=u; next();
}
function admin(req,res,next){
  if(!req.session.user){flash(req,'error','กรุณาเข้าสู่ระบบผู้ดูแล');return res.redirect('/login?next=/admin');}
  const u=currentUser(req);
  if(!u || u.role!=='admin') return res.status(403).send(page('ไม่มีสิทธิ์',`<div class="empty"><h2>ไม่มีสิทธิ์เข้าถึง</h2><a class="btn" href="/">กลับหน้าร้าน</a></div>`));
  req.user=u; next();
}

function page(title,body,req){
  const u=req?.session?.user ? currentUser(req) : null;
  const flashMsg=getFlash(req||{session:{}});
  const name=esc(setting('store_name','KEN CODE STORE'));
  return `<!doctype html><html lang="th"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${esc(title)} • ${name}</title>
  <meta name="theme-color" content="#070707">
  <style>
  *{box-sizing:border-box}html,body{margin:0;background:#050505;color:#f4f4f6;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  body{min-height:100vh;background-image:radial-gradient(circle at 20% 20%,rgba(135,55,255,.10),transparent 26%),radial-gradient(circle at 90% 70%,rgba(40,130,255,.06),transparent 22%)}
  a{color:inherit;text-decoration:none}.wrap{width:min(1180px,92%);margin:auto}.muted{color:#92929e}.small{font-size:.88rem}
  .topbar{background:#090909;border-bottom:1px solid #1c1c20;padding:10px 0;white-space:nowrap;overflow:auto;color:#aaa;text-align:center}
  header{position:sticky;top:0;z-index:20;background:rgba(5,5,5,.88);backdrop-filter:blur(18px);border-bottom:1px solid #17171a}
  .nav{min-height:76px;display:flex;align-items:center;gap:18px}.brand{display:flex;align-items:center;gap:12px;font-weight:900;font-size:1.25rem;letter-spacing:.5px;flex:1}.brandmark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#fff,#8b55ff 45%,#231044);color:#090909;font-weight:1000;box-shadow:0 0 28px rgba(150,80,255,.25)}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:11px 15px;border:1px solid #29292e;background:#0d0d0f;border-radius:999px}.navlinks{display:flex;gap:8px;align-items:center}.navlinks a{padding:10px 12px;color:#bbb}.navlinks a:hover{color:#fff}.hamb{display:none}
  .hero{padding:72px 0 45px}.hero h1{font-size:clamp(2.6rem,8vw,5.8rem);line-height:.95;margin:0 0 18px;font-weight:1000;letter-spacing:-4px}.gradient{background:linear-gradient(90deg,#fff,#b58cff,#6f4cff);-webkit-background-clip:text;background-clip:text;color:transparent}.hero p{font-size:1.12rem;color:#a0a0ad;max-width:680px}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:25px}.btn{border:1px solid #303035;background:#151518;color:#fff;padding:13px 18px;border-radius:14px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.btn.primary{background:linear-gradient(135deg,#fff,#d9d9dc);color:#0a0a0b}.btn.purple{background:linear-gradient(135deg,#8f5cff,#5d32d9);border:0}.btn.danger{background:#2a0c10;color:#ff6972;border-color:#5a1820}.btn.full{width:100%}.btn:disabled{opacity:.45;cursor:not-allowed}
  .section{padding:26px 0 55px}.sectionhead{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:18px}.sectionhead h2{margin:0;font-size:1.65rem}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:linear-gradient(145deg,#101012,#080809);border:1px solid #202024;border-radius:22px;overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,.18)}.product{display:flex;flex-direction:column}.thumb{aspect-ratio:16/9;background:#111;display:grid;place-items:center;overflow:hidden}.thumb img{width:100%;height:100%;object-fit:cover}.placeholder{font-size:3rem;font-weight:1000;color:#333}.pbody{padding:17px}.pbody h3{margin:0 0 8px;font-size:1.12rem}.price{font-size:1.35rem;font-weight:900}.old{text-decoration:line-through;color:#666;margin-right:7px;font-size:.9rem}.stock{margin:12px 0;color:#aaa}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#00c77a;margin-right:7px}.dot.red{background:#ff4757}
  .detail{display:grid;grid-template-columns:1.1fr .9fr;gap:25px;padding:45px 0}.detailimg{min-height:350px}.detailbox{padding:25px}.detailbox h1{font-size:clamp(2rem,5vw,3.5rem);margin:0 0 12px}.variant{display:flex;align-items:center;justify-content:space-between;border:1px solid #242429;background:#0c0c0e;padding:15px;border-radius:16px;margin:9px 0;cursor:pointer}.variant:hover,.variant.selected{border-color:#bda3ff;box-shadow:0 0 0 1px #7d55e7 inset}.variant input{accent-color:#8f5cff}
  .form{max-width:650px;margin:45px auto}.form h1{font-size:2rem}.field{margin:13px 0}.field label{display:block;color:#aaa;margin-bottom:7px}.field input,.field textarea,.field select{width:100%;padding:13px 14px;border-radius:13px;border:1px solid #29292e;background:#101012;color:#fff;outline:none}.field textarea{min-height:120px;resize:vertical}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .alert{padding:14px 16px;border-radius:14px;margin:14px 0;border:1px solid #303035}.alert.error{background:#250b0e;border-color:#681b22;color:#ff8d95}.alert.success{background:#082116;border-color:#0c5c3a;color:#79e8b8}.alert.info{background:#10131e;color:#a9b8ff}
  .account{display:grid;grid-template-columns:280px 1fr;gap:18px;padding:30px 0 60px}.side{padding:18px;position:sticky;top:95px;height:max-content}.side a{display:block;padding:12px;border-radius:12px;color:#bbb}.side a:hover{background:#18181c;color:#fff}.balance{padding:18px;border:1px solid #28282e;border-radius:18px;background:#0c0c0f;margin-bottom:12px}.balance strong{display:block;font-size:1.7rem}
  table{width:100%;border-collapse:collapse}th,td{padding:12px 10px;border-bottom:1px solid #222;text-align:left;vertical-align:top}th{color:#999;font-size:.85rem}.tablewrap{overflow:auto}.status{display:inline-block;padding:5px 9px;border-radius:999px;background:#19191d;color:#ccc;font-size:.8rem}.status.green{background:#09291c;color:#65e5ac}.status.red{background:#300b0f;color:#ff8c94}.status.yellow{background:#33270b;color:#ffd76c}
  .adminnav{display:flex;gap:8px;overflow:auto;padding:15px 0}.adminnav a{white-space:nowrap;padding:9px 13px;border:1px solid #27272c;border-radius:12px;color:#bbb}.adminnav a:hover{color:#fff;background:#151518}.statgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.stat{padding:18px;border:1px solid #242429;border-radius:18px;background:#0d0d10}.stat b{font-size:1.65rem;display:block;margin-top:6px}.adminsection{padding:25px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:15px}.empty{text-align:center;padding:70px 20px;color:#888}.list{display:grid;gap:10px}.listitem{padding:15px;border:1px solid #222;border-radius:16px;background:#0c0c0e}.right{margin-left:auto}.flex{display:flex;align-items:center;gap:10px}.between{display:flex;justify-content:space-between;gap:10px;align-items:center}
  .chat{position:fixed;right:18px;bottom:20px;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:#eee;color:#111;font-size:1.6rem;box-shadow:0 0 35px rgba(255,255,255,.25);z-index:30}
  footer{border-top:1px solid #19191d;padding:35px 0;color:#777;margin-top:40px}.code{white-space:pre-wrap;background:#0a0a0c;border:1px solid #222;padding:14px;border-radius:12px;font-family:ui-monospace,monospace}
  @media(max-width:850px){.grid{grid-template-columns:repeat(2,1fr)}.detail,.account{grid-template-columns:1fr}.side{position:static}.statgrid{grid-template-columns:repeat(2,1fr)}.navlinks{display:none}.hamb{display:inline-flex}.hero{padding-top:45px}.detailimg{min-height:230px}}
  @media(max-width:560px){.wrap{width:94%}.grid{grid-template-columns:1fr 1fr;gap:10px}.pbody{padding:12px}.thumb{aspect-ratio:1/1}.row,.two{grid-template-columns:1fr}.statgrid{grid-template-columns:1fr 1fr}.brand{font-size:1rem}.nav{min-height:65px}.hero h1{letter-spacing:-2px}.btn{padding:12px 14px}.section{padding-bottom:35px}}
  </style></head><body>
  <div class="topbar">${esc(setting('announcement','ยินดีต้อนรับสู่ KEN CODE STORE'))}</div>
  <header><div class="wrap nav">
    <a class="brand" href="/"><span class="brandmark">K</span><span>${name}</span></a>
    <nav class="navlinks"><a href="/">หน้าแรก</a><a href="/shop">สินค้า</a>${u?`<a href="/account">บัญชี</a>`:''}${u?.role==='admin'?`<a href="/admin">Admin</a>`:''}</nav>
    ${u?`<a class="pill" href="/account">💰 ${money(u.balance)}</a><a class="btn" href="/account">👤 ${esc(u.name)}</a>`:`<a class="btn" href="/login">เข้าสู่ระบบ</a>`}
  </div></header>
  <main class="wrap">
  ${flashMsg?`<div class="alert ${flashMsg.type==='error'?'error':flashMsg.type==='success'?'success':'info'}">${esc(flashMsg.msg)}</div>`:''}
  ${body}
  </main>
  <footer><div class="wrap"><strong>${name}</strong><div class="small">${esc(setting('tagline','Source Code • Script • Website • Bot'))}</div><div class="small">${esc(setting('contact',''))}</div></div></footer>
  <a class="chat" href="mailto:admin@example.com" title="ติดต่อร้าน">💬</a>
  </body></html>`;
}

function adminLayout(title,body,req){
  return page(title,`
    <div class="adminnav">
      <a href="/admin">Dashboard</a><a href="/admin/products">สินค้า</a><a href="/admin/orders">Orders</a>
      <a href="/admin/users">ลูกค้า</a><a href="/admin/topups">เติมเงิน</a><a href="/admin/coupons">คูปอง</a><a href="/admin/reseller-keys">คีย์ตัวแทน</a>
      <a href="/admin/settings">ตั้งค่า</a><a href="/">ดูหน้าร้าน</a>
    </div>${body}`,req);
}

app.get('/',(req,res)=>{
  const products=db.prepare('SELECT * FROM products WHERE active=1 ORDER BY featured DESC,id DESC LIMIT 12').all();
  const cats=db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY name').all();
  res.send(page('หน้าแรก',`
    <section class="hero">
      <span class="pill">⚡ ${esc(setting('tagline'))}</span>
      <h1>KEN<br><span class="gradient">CODE STORE</span></h1>
      <p>ร้านค้าดิจิทัลสำหรับ Source Code, Script, Website และ Bot ซื้อผ่าน Wallet แล้วรับสินค้าได้ทันที</p>
      <div class="actions"><a class="btn primary" href="/shop">🛍️ ดูสินค้าทั้งหมด</a><a class="btn" href="/account">💰 เติมเงิน</a></div>
    </section>
    <section class="section"><div class="sectionhead"><div><div class="muted">CATEGORIES</div><h2>เลือกหมวดสินค้า</h2></div></div>
      <div class="actions">${cats.map(c=>`<a class="pill" href="/shop?category=${encodeURIComponent(c.name)}">${esc(c.name)}</a>`).join('')}</div>
    </section>
    <section class="section"><div class="sectionhead"><div><div class="muted">FEATURED</div><h2>สินค้าแนะนำ</h2></div><a class="btn" href="/shop">ดูทั้งหมด →</a></div>
      <div class="grid">${products.map(productCard).join('')}</div>
    </section>`,req));
});
function productCard(p){
  const stock = Number(p.stock||0);
  return `<article class="card product"><a href="/product/${encodeURIComponent(p.slug)}"><div class="thumb">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:`<div class="placeholder">KEN</div>`}</div>
  <div class="pbody"><div class="muted small">${esc(p.category)}</div><h3>${esc(p.title)}</h3>
  <div><span class="price">${money(p.price)}</span>${p.old_price?` <span class="old">${money(p.old_price)}</span>`:''}</div>
  <div class="stock"><span class="dot ${stock>0?'':'red'}"></span>${esc(p.status)} · ${stock>0?'เหลือ '+stock:'หมด'}</div>
  <span class="btn ${stock>0&&p.active?'primary':''} full">${stock>0?'ดูสินค้า →':'ปิดปรับปรุง'}</span></div></a></article>`;
}

app.get('/shop',(req,res)=>{
  const q=(req.query.q||'').trim(), cat=(req.query.category||'').trim();
  let sql='SELECT * FROM products WHERE active=1', args=[];
  if(q){sql+=' AND (title LIKE ? OR description LIKE ? OR category LIKE ?)';args.push('%'+q+'%','%'+q+'%','%'+q+'%');}
  if(cat){sql+=' AND category=?';args.push(cat);}
  sql+=' ORDER BY featured DESC,id DESC';
  const ps=db.prepare(sql).all(...args);
  res.send(page('สินค้า',`<section class="section"><div class="sectionhead"><div><div class="muted">KEN SHOP</div><h1>สินค้าทั้งหมด</h1></div></div>
  <form class="card" style="padding:12px;display:flex;gap:8px;margin-bottom:20px"><input name="q" value="${esc(q)}" placeholder="ค้นหาสินค้า..." style="flex:1;background:#0d0d0f;color:#fff;border:0;padding:12px;border-radius:12px"><select name="category" style="background:#0d0d0f;color:#fff;border:1px solid #222;border-radius:12px;padding:10px"><option value="">ทุกหมวด</option>${db.prepare('SELECT name FROM categories WHERE active=1').all().map(c=>`<option ${c.name===cat?'selected':''}>${esc(c.name)}</option>`).join('')}</select><button class="btn primary">ค้นหา</button></form>
  <div class="grid">${ps.length?ps.map(productCard).join(''):`<div class="empty" style="grid-column:1/-1">ไม่พบสินค้า</div>`}</div></section>`,req));
});

app.get('/product/:slug',(req,res)=>{
  const p=db.prepare('SELECT * FROM products WHERE slug=?').get(req.params.slug);
  if(!p || !p.active)return res.status(404).send(page('ไม่พบสินค้า',`<div class="empty"><h2>ไม่พบสินค้านี้</h2><a class="btn" href="/shop">กลับร้านค้า</a></div>`,req));
  const vars=db.prepare('SELECT * FROM product_variants WHERE product_id=? AND active=1 ORDER BY id').all(p.id);
  if(!vars.length) vars.push({id:0,name:'Standard',price:p.price,old_price:p.old_price,stock:p.stock,active:1});
  res.send(page(p.title,`<section class="detail"><div class="card detailimg"><div class="thumb" style="height:100%;min-height:350px">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:`<div class="placeholder">KEN</div>`}</div></div>
  <div class="card detailbox"><div class="muted">${esc(p.category)}</div><h1>${esc(p.title)}</h1><p class="muted">${esc(p.description)}</p>
  ${(()=>{const rk=activeResellerForUser(req.session.user?.id);return rk?`<div class="alert success">🏷️ ราคาตัวแทนเปิดใช้งานอยู่ — ลด ${rk.discount_percent}%</div>`:''})()}
  <form method="post" action="/buy">
  <input type="hidden" name="product_id" value="${p.id}">
  <h3>เลือกแพ็กเกจ</h3>
  ${vars.map((v,i)=>{const rp=resellerPrice(v.price,req.session.user?.id);return `<label class="variant ${i===0?'selected':''}" onclick="document.querySelectorAll('.variant').forEach(x=>x.classList.remove('selected'));this.classList.add('selected')"><span><input type="radio" name="variant_id" value="${v.id}" ${i===0?'checked':''}> ${esc(v.name)}<br><small class="muted">${v.stock>0?'เหลือ '+v.stock+' ชิ้น':'หมด'}</small></span><span style="text-align:right"><b>${money(rp.price)}</b>${rp.key?` <span class="status green">-${rp.discount}%</span>`:''}${v.old_price?`<br><small class="old">${money(v.old_price)}</small>`:''}</span></label>`;}).join('')}
  <div class="field"><label>โค้ดส่วนลด (ถ้ามี)</label><input name="coupon" placeholder="KEN10"></div>
  <button class="btn primary full" ${vars.every(v=>v.stock<=0)?'disabled':''}>🛒 ซื้อด้วย KEN COIN</button>
  </form>
  </div></section>`,req));
});

app.get('/register',(req,res)=>res.send(page('สมัครสมาชิก',`<form class="form card" style="padding:25px" method="post" action="/register"><h1>สร้างบัญชี</h1>
<div class="field"><label>ชื่อ</label><input name="name" required maxlength="80"></div><div class="field"><label>Email</label><input type="email" name="email" required></div>
<div class="field"><label>รหัสผ่าน</label><input type="password" name="password" required minlength="6"></div><button class="btn primary full">สมัครสมาชิก</button><p class="muted">มีบัญชีแล้ว? <a href="/login">เข้าสู่ระบบ</a></p></form>`,req)));
app.post('/register',(req,res)=>{
  const name=(req.body.name||'').trim(), email=(req.body.email||'').trim().toLowerCase(), password=req.body.password||'';
  if(!name||!email||password.length<6){flash(req,'error','กรอกข้อมูลให้ครบ และรหัสผ่านอย่างน้อย 6 ตัว');return res.redirect('/register');}
  try{const r=db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,bcrypt.hashSync(password,12));req.session.user={id:r.lastInsertRowid};flash(req,'success','สมัครสมาชิกสำเร็จ');res.redirect('/account');}
  catch(e){flash(req,'error','Email นี้ถูกใช้งานแล้ว');res.redirect('/register');}
});
app.get('/login',(req,res)=>res.send(page('เข้าสู่ระบบ',`<form class="form card" style="padding:25px" method="post" action="/login"><h1>เข้าสู่ระบบ</h1>
<div class="field"><label>Email</label><input type="email" name="email" required></div><div class="field"><label>รหัสผ่าน</label><input type="password" name="password" required></div><button class="btn primary full">เข้าสู่ระบบ</button><p class="muted">ยังไม่มีบัญชี? <a href="/register">สมัครสมาชิก</a></p></form>`,req)));
app.post('/login',(req,res)=>{
  const email=(req.body.email||'').trim().toLowerCase(), pass=req.body.password||'', u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if(!u||!bcrypt.compareSync(pass,u.password)){flash(req,'error','อีเมลหรือรหัสผ่านไม่ถูกต้อง');return res.redirect('/login');}
  req.session.user={id:u.id}; const next=req.query.next||'/account'; res.redirect(next.startsWith('/')?next:'/account');
});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));

app.get('/account',auth,(req,res)=>{
  const u=req.user;
  const orders=db.prepare(`SELECT o.*,p.title,COALESCE(v.name,'Standard') variant_name FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN product_variants v ON v.id=o.variant_id WHERE o.user_id=? ORDER BY o.id DESC LIMIT 10`).all(u.id);
  res.send(page('บัญชี',`<section class="account"><aside class="card side"><div class="balance"><span class="muted">KEN COIN</span><strong>${money(u.balance)}</strong><a class="btn primary full" href="/topup">＋ เติมเงิน</a></div>
  <a href="/shop">🛍️ ร้านค้า</a><a href="/topup">💳 เติมเงิน</a><a href="/orders">🧾 ประวัติการซื้อ</a><a href="/transactions">📜 ประวัติเงิน</a><a href="/profile">👤 โปรไฟล์</a>${u.role==='admin'?'<a href="/admin">⚙️ Admin</a>':''}<a href="/logout" style="color:#ff737c">↪ ออกจากระบบ</a></aside>
  <section><h1>สวัสดี ${esc(u.name)} 👋</h1><p class="muted">จัดการบัญชีและรายการของคุณจากหน้านี้</p>
  <div class="statgrid"><div class="stat">ยอดเงิน<b>${money(u.balance)}</b></div><div class="stat">คำสั่งซื้อ<b>${db.prepare('SELECT COUNT(*) c FROM orders WHERE user_id=?').get(u.id).c}</b></div></div>
  ${(()=>{const rk=activeResellerForUser(u.id);return `<div class="card" style="padding:18px;margin:18px 0;border-color:#5d32d9"><div class="between"><div><b>🏷️ ราคาตัวแทน</b><div class="muted small">ใส่คีย์ตัวแทนเพื่อรับส่วนลดจากราคาปกติ</div></div>${rk?`<span class="status green">เปิดใช้งาน -${rk.discount_percent}%</span>`:''}</div><form method="post" action="/reseller-key" class="flex" style="margin-top:12px"><input name="code" value="${rk?esc(rk.code):''}" placeholder="KEN-REP-XXXXXX" required style="flex:1;background:#101012;color:#fff;border:1px solid #29292e;border-radius:13px;padding:13px"><button class="btn purple">${rk?'เปลี่ยนคีย์':'ใช้คีย์ตัวแทน'}</button></form></div>`})()}
  <div class="section"><div class="sectionhead"><h2>รายการซื้อล่าสุด</h2><a href="/orders">ทั้งหมด →</a></div><div class="list">${orders.length?orders.map(o=>`<div class="listitem between"><div><b>${esc(o.title)}</b><div class="muted small">${esc(o.variant_name)} · ${new Date(o.created_at).toLocaleString('th-TH')}</div></div><div><b>${money(o.amount)}</b><br>${o.status==='paid'?`<a class="small" href="/download/${esc(o.download_token)}">ดาวน์โหลด</a>`:esc(o.status)}</div></div>`).join(''):'ยังไม่มีรายการซื้อ'}</div></div>
  </section></section>`,req));
});

app.post('/reseller-key',auth,(req,res)=>{
  const code=String(req.body.code||'').trim().toUpperCase();
  const k=db.prepare('SELECT * FROM reseller_keys WHERE code=?').get(code);
  if(!k||!k.active){flash(req,'error','ไม่พบคีย์ตัวแทน หรือคีย์ถูกปิดใช้งาน');return res.redirect('/account');}
  if(k.expires_at && new Date(k.expires_at)<new Date()){flash(req,'error','คีย์ตัวแทนหมดอายุแล้ว');return res.redirect('/account');}
  if(k.max_uses>0 && k.used_count>=k.max_uses){flash(req,'error','คีย์ตัวแทนถูกใช้งานครบจำนวนแล้ว');return res.redirect('/account');}
  const old=db.prepare('SELECT key_id FROM user_reseller_keys WHERE user_id=?').get(req.user.id);
  try{db.transaction(()=>{
    if(old && old.key_id!==k.id) db.prepare('UPDATE reseller_keys SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END WHERE id=?').run(old.key_id);
    db.prepare('INSERT INTO user_reseller_keys(user_id,key_id,activated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET key_id=excluded.key_id,activated_at=excluded.activated_at').run(req.user.id,k.id,now());
    if(!old || old.key_id!==k.id) db.prepare('UPDATE reseller_keys SET used_count=used_count+1 WHERE id=?').run(k.id);
  })(); flash(req,'success',`เปิดราคาตัวแทนแล้ว ลด ${k.discount_percent}%`);}catch(e){flash(req,'error','เปิดใช้คีย์ไม่สำเร็จ');}
  res.redirect('/account');
});

async function verifySlipWithEasySlip(filePath, expectedAmount, topupId){
  const apiKey=String(process.env.EASYSLIP_API_KEY||'').trim();
  if(!apiKey) return {configured:false, ok:false, message:'ยังไม่ได้ตั้ง EASYSLIP_API_KEY'};
  const maxBytes=4*1024*1024;
  const stat=fs.statSync(filePath);
  if(stat.size>maxBytes) return {configured:true, ok:false, message:'ไฟล์สลิปใหญ่เกิน 4 MB'};
  const buf=fs.readFileSync(filePath);
  const ext=path.extname(filePath).toLowerCase();
  const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';
  const form=new FormData();
  form.append('image',new Blob([buf],{type:mime}),path.basename(filePath));
  form.append('remark',`KEN topup #${topupId}`);
  form.append('matchAmount',String(expectedAmount));
  form.append('checkDuplicate','true');
  form.append('matchAccount','true');
  const r=await fetch('https://api.easyslip.com/v2/verify/bank',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form});
  let j={}; try{j=await r.json();}catch{}
  if(!r.ok || !j.success){
    const msg=j?.error?.message || j?.error?.code || `EasySlip HTTP ${r.status}`;
    return {configured:true,ok:false,message:msg,raw:j};
  }
  const d=j.data||{};
  const amount=Number(d.amountInSlip ?? d.rawSlip?.amount?.amount ?? 0);
  const duplicate=!!d.isDuplicate;
  const amountMatched=d.isAmountMatched===true || Math.abs(amount-Number(expectedAmount))<0.005;
  const receiverMatched=!!d.matchedAccount;
  const requireAccount=String(process.env.EASYSLIP_MATCH_ACCOUNT||'true').toLowerCase()!=='false';
  const ok=!duplicate && amountMatched && (!requireAccount || receiverMatched);
  let reason='ตรวจสอบผ่าน';
  if(duplicate) reason='สลิปซ้ำ';
  else if(!amountMatched) reason=`ยอดในสลิป ${amount} บาท ไม่ตรงกับยอด ${expectedAmount} บาท`;
  else if(requireAccount && !receiverMatched) reason='ไม่พบว่าบัญชีผู้รับตรงกับบัญชีที่ลงทะเบียนใน EasySlip';
  return {configured:true,ok,message:reason,amount,transRef:d.rawSlip?.transRef||d.transRef||'',receiverMatched,duplicate,raw:d};
}

function autoApproveTopup(t, verification){
  const tx=db.transaction(()=>{
    const fresh=db.prepare('SELECT * FROM topups WHERE id=?').get(t.id);
    if(!fresh || fresh.status!=='pending') return false;
    db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(fresh.amount,fresh.user_id);
    db.prepare('INSERT INTO wallet_transactions(user_id,amount,type,note,ref_id) VALUES(?,?,?,?,?)').run(fresh.user_id,fresh.amount,'topup','เติมเงินอัตโนมัติจากสลิป #'+fresh.id,fresh.id);
    db.prepare("UPDATE topups SET status='approved',note=?,reviewed_at=?,verify_status='verified',verify_message=?,trans_ref=?,slip_amount=?,receiver_match=?,verified_at=? WHERE id=?").run('ตรวจสอบสลิปอัตโนมัติผ่าน',now(),verification.message,verification.transRef||'',verification.amount||fresh.amount,verification.receiverMatched?1:0,now(),fresh.id);
    return true;
  });
  return tx();
}

app.get('/topup',auth,(req,res)=>{
  res.send(page('เติมเงิน',`<section class="section"><div class="card" style="padding:25px;max-width:720px;margin:auto"><h1>เติมเงิน KEN COIN</h1><p class="muted">โอนเงินเข้าบัญชีด้านล่าง แล้วอัปโหลดสลิป ระบบจะตรวจสอบอัตโนมัติเมื่อเปิดใช้งาน EasySlip</p>
  <div class="card" style="padding:16px;margin:15px 0"><b>ข้อมูลรับเงิน</b><p>ธนาคาร: ${esc(setting('bank_name'))}</p><p>ชื่อบัญชี: ${esc(setting('bank_account_name')||'-')}</p><p>เลขบัญชี: ${esc(setting('bank_account_number')||'-')}</p></div>
  <form method="post" action="/topup" enctype="multipart/form-data"><div class="field"><label>จำนวนเงิน (บาท)</label><input type="number" name="amount" min="1" max="1000000" required></div><div class="field"><label>สลิปการโอน</label><input type="file" name="slip" accept="image/*" required></div><button class="btn primary full">ส่งรายการเติมเงิน</button></form>
  </div></section>`,req));
});
app.post('/topup',auth,uploadSlip.single('slip'),async (req,res)=>{
  const amount=Math.trunc(Number(req.body.amount));
  if(!amount||amount<1||!req.file){flash(req,'error','กรุณาระบุยอดและแนบสลิป');return res.redirect('/topup');}
  const info=db.prepare('INSERT INTO topups(user_id,amount,slip_file,note,verify_status) VALUES(?,?,?,?,?)').run(req.user.id,amount,req.file.filename,'กำลังตรวจสอบสลิปอัตโนมัติ','checking');
  const topup=db.prepare('SELECT * FROM topups WHERE id=?').get(info.lastInsertRowid);
  try{
    const verification=await verifySlipWithEasySlip(path.join(UPLOAD_DIR,req.file.filename),amount,topup.id);
    if(verification.configured && verification.ok){
      autoApproveTopup(topup,verification);
      flash(req,'success',`ตรวจสอบสลิปผ่านแล้ว เติมเงิน ${money(amount)} เข้า KEN COIN เรียบร้อย`);
    }else if(verification.configured){
      db.prepare("UPDATE topups SET verify_status='failed',verify_message=?,trans_ref=?,slip_amount=?,receiver_match=?,note=? WHERE id=?").run(verification.message,verification.transRef||'',verification.amount||null,verification.receiverMatched?1:0,'ตรวจสอบอัตโนมัติไม่ผ่าน — รอแอดมินตรวจสอบ',topup.id);
      flash(req,'error',`ระบบตรวจสอบสลิปไม่ผ่าน: ${verification.message} รายการถูกส่งให้แอดมินตรวจสอบ`);
    }else{
      db.prepare("UPDATE topups SET verify_status='not_configured',verify_message=?,note=? WHERE id=?").run(verification.message,'ยังไม่ได้เปิดระบบตรวจสอบอัตโนมัติ — รอแอดมินตรวจสอบ',topup.id);
      flash(req,'success','ส่งสลิปแล้ว ระบบจะรอแอดมินตรวจสอบ');
    }
  }catch(e){
    console.error('EASYSLIP VERIFY ERROR',e);
    db.prepare("UPDATE topups SET verify_status='error',verify_message=?,note=? WHERE id=?").run(String(e.message||e),'เกิดข้อผิดพลาดระหว่างตรวจสอบ — รอแอดมินตรวจสอบ',topup.id);
    flash(req,'error','ระบบตรวจสอบอัตโนมัติขัดข้อง รายการถูกส่งให้แอดมินตรวจสอบ');
  }
  res.redirect('/account');
});

app.get('/orders',auth,(req,res)=>{
  const os=db.prepare(`SELECT o.*,p.title,COALESCE(v.name,'Standard') variant_name FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN product_variants v ON v.id=o.variant_id WHERE o.user_id=? ORDER BY o.id DESC`).all(req.user.id);
  res.send(page('ประวัติการซื้อ',`<section class="section"><h1>ประวัติการซื้อ</h1><div class="tablewrap card"><table><thead><tr><th>สินค้า</th><th>แพ็กเกจ</th><th>ราคา</th><th>ตัวแทน</th><th>สถานะ</th><th>วันที่</th><th></th></tr></thead><tbody>${os.map(o=>`<tr><td>${esc(o.title)}</td><td>${esc(o.variant_name)}</td><td>${money(o.amount)}</td><td>${o.reseller_key_id?`<span class="status green">-${o.reseller_discount_percent}%</span>`:'-'}</td><td><span class="status green">${esc(o.status)}</span></td><td>${new Date(o.created_at).toLocaleString('th-TH')}</td><td>${o.download_token?`<a class="btn" href="/download/${esc(o.download_token)}">ดาวน์โหลด</a>`:''}</td></tr>`).join('')}</tbody></table></div></section>`,req));
});
app.get('/transactions',auth,(req,res)=>{
  const ts=db.prepare('SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.send(page('ประวัติเงิน',`<section class="section"><h1>ประวัติเงิน</h1><div class="tablewrap card"><table><thead><tr><th>รายการ</th><th>จำนวน</th><th>วันที่</th></tr></thead><tbody>${ts.map(t=>`<tr><td>${esc(t.type)}<div class="muted small">${esc(t.note)}</div></td><td style="color:${t.amount>=0?'#65e5ac':'#ff7b84'}">${t.amount>=0?'+':''}${money(t.amount)}</td><td>${new Date(t.created_at).toLocaleString('th-TH')}</td></tr>`).join('')}</tbody></table></div></section>`,req));
});
app.get('/profile',auth,(req,res)=>res.send(page('โปรไฟล์',`<form class="form card" style="padding:25px" method="post"><h1>โปรไฟล์</h1><div class="field"><label>ชื่อ</label><input name="name" value="${esc(req.user.name)}"></div><div class="field"><label>Email</label><input value="${esc(req.user.email)}" disabled></div><button class="btn primary">บันทึก</button></form>`,req)));
app.post('/profile',auth,(req,res)=>{db.prepare('UPDATE users SET name=? WHERE id=?').run((req.body.name||req.user.name).trim(),req.user.id);flash(req,'success','บันทึกโปรไฟล์แล้ว');res.redirect('/profile');});

function couponInfo(code,userId,subtotal){
  if(!code)return {discount:0,coupon:null,error:''};
  const c=db.prepare('SELECT * FROM coupons WHERE code=?').get(String(code).trim().toUpperCase());
  if(!c||!c.active)return {discount:0,coupon:null,error:'ไม่พบคูปองหรือคูปองถูกปิด'};
  if(c.expires_at && new Date(c.expires_at)<new Date())return {discount:0,coupon:null,error:'คูปองหมดอายุแล้ว'};
  if(c.max_uses>0 && c.used_count>=c.max_uses)return {discount:0,coupon:null,error:'คูปองถูกใช้งานครบจำนวนแล้ว'};
  if(subtotal<c.min_amount)return {discount:0,coupon:null,error:'ยอดซื้อไม่ถึงขั้นต่ำของคูปอง'};
  const used=db.prepare('SELECT id FROM coupon_uses WHERE coupon_id=? AND user_id=?').get(c.id,userId);
  if(used)return {discount:0,coupon:null,error:'คุณเคยใช้คูปองนี้แล้ว'};
  const discount=c.type==='percent'?Math.floor(subtotal*c.value/100):Math.min(c.value,subtotal);
  return {discount,coupon:c,error:''};
}
app.post('/buy',auth,(req,res)=>{
  const p=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(req.body.product_id));
  if(!p){flash(req,'error','ไม่พบสินค้า');return res.redirect('/shop');}
  const vid=Number(req.body.variant_id||0);
  let v=vid?db.prepare('SELECT * FROM product_variants WHERE id=? AND product_id=? AND active=1').get(vid,p.id):null;
  if(!v)v=db.prepare('SELECT * FROM product_variants WHERE product_id=? AND active=1 ORDER BY id LIMIT 1').get(p.id);
  const basePrice=v?Number(v.price):Number(p.price), stock=v?Number(v.stock):Number(p.stock);
  if(stock<=0){flash(req,'error','สินค้าหมด');return res.redirect('/product/'+p.slug);}
  const rp=resellerPrice(basePrice,req.user.id);
  if(rp.key && String(req.body.coupon||'').trim()){flash(req,'error','ราคาตัวแทนไม่สามารถใช้คูปองส่วนลดร่วมกันได้');return res.redirect('/product/'+p.slug);}
  const ci=couponInfo(req.body.coupon,req.user.id,rp.price);
  if(ci.error){flash(req,'error',ci.error);return res.redirect('/product/'+p.slug);}
  const total=Math.max(0,rp.price-ci.discount);
  const tx=db.transaction(()=>{
    const u=db.prepare('SELECT balance FROM users WHERE id=?').get(req.user.id);
    if(u.balance<total) throw new Error('เงินใน Wallet ไม่พอ');
    db.prepare('UPDATE users SET balance=balance-? WHERE id=?').run(total,req.user.id);
    if(v) db.prepare('UPDATE product_variants SET stock=stock-1 WHERE id=? AND stock>0').run(v.id);
    db.prepare('UPDATE products SET stock=CASE WHEN stock>0 THEN stock-1 ELSE 0 END WHERE id=?').run(p.id);
    const ord=db.prepare('INSERT INTO orders(user_id,product_id,variant_id,coupon_id,amount,status,download_token,reseller_key_id,reseller_discount_percent) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(req.user.id,p.id,v?.id||null,ci.coupon?.id||null,total,'paid',token(),rp.key?.id||null,rp.discount||0);
    db.prepare('INSERT INTO wallet_transactions(user_id,amount,type,note,ref_id) VALUES(?,?,?,?,?)')
      .run(req.user.id,-total,'purchase','ซื้อ '+p.title,ord.lastInsertRowid);
    if(ci.coupon) {db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE id=?').run(ci.coupon.id);db.prepare('INSERT INTO coupon_uses(coupon_id,user_id,order_id) VALUES(?,?,?)').run(ci.coupon.id,req.user.id,ord.lastInsertRowid);}
    return ord.lastInsertRowid;
  });
  try{const oid=tx();flash(req,'success','ซื้อสำเร็จ! สามารถดาวน์โหลดสินค้าได้ทันที');res.redirect('/orders#order-'+oid);}
  catch(e){flash(req,'error',e.message||'ไม่สามารถซื้อสินค้าได้');res.redirect('/product/'+p.slug);}
});
app.get('/download/:token',auth,(req,res)=>{
  const o=db.prepare(`SELECT o.*,p.download_file,p.title FROM orders o JOIN products p ON p.id=o.product_id WHERE o.download_token=? AND o.user_id=?`).get(req.params.token,req.user.id);
  if(!o)return res.status(404).send('ไม่พบไฟล์');
  if(!o.download_file || !fs.existsSync(path.join(UPLOAD_DIR,o.download_file)))return res.status(404).send(page('ยังไม่มีไฟล์',`<div class="empty"><h2>สินค้านี้ยังไม่มีไฟล์ดาวน์โหลด</h2></div>`,req));
  res.download(path.join(UPLOAD_DIR,o.download_file),path.basename(o.download_file));
});

app.get('/admin',admin,(req,res)=>{
  const stats={
    users:db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'").get().c,
    products:db.prepare('SELECT COUNT(*) c FROM products').get().c,
    orders:db.prepare('SELECT COUNT(*) c FROM orders').get().c,
    sales:db.prepare("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE status='paid'").get().s,
    pending:db.prepare("SELECT COUNT(*) c FROM topups WHERE status='pending'").get().c,
    pendingAmount:db.prepare("SELECT COALESCE(SUM(amount),0) s FROM topups WHERE status='pending'").get().s
  };
  const recent=db.prepare(`SELECT o.*,u.name,u.email,p.title FROM orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id ORDER BY o.id DESC LIMIT 10`).all();
  res.send(adminLayout('Admin Dashboard',`<section class="adminsection"><h1>KEN Admin Dashboard</h1><div class="statgrid">
  <div class="stat">ลูกค้า<b>${stats.users}</b></div><div class="stat">สินค้า<b>${stats.products}</b></div><div class="stat">Orders<b>${stats.orders}</b></div><div class="stat">ยอดขาย<b>${money(stats.sales)}</b></div></div>
  <div class="two" style="margin-top:15px"><div class="stat">เติมเงินรอตรวจ<b>${stats.pending}</b><div class="muted">${money(stats.pendingAmount)}</div><a class="btn" href="/admin/topups">ตรวจสอบ →</a></div>
  <div class="stat">ลัดการทำงาน<div class="actions"><a class="btn purple" href="/admin/products/new">＋ เพิ่มสินค้า</a><a class="btn" href="/admin/users">จัดการลูกค้า</a></div></div></div>
  <div class="section"><div class="sectionhead"><h2>Orders ล่าสุด</h2><a href="/admin/orders">ดูทั้งหมด</a></div><div class="tablewrap card"><table><tr><th>#</th><th>ลูกค้า</th><th>สินค้า</th><th>ยอด</th><th>วันที่</th></tr>${recent.map(o=>`<tr><td>#${o.id}</td><td>${esc(o.name)}<div class="muted">${esc(o.email)}</div></td><td>${esc(o.title)}</td><td>${money(o.amount)}</td><td>${new Date(o.created_at).toLocaleString('th-TH')}</td></tr>`).join('')}</table></div></div></section>`,req));
});

function productForm(p={},vars=[]){
  const rows=(vars.length?vars:[{name:'Standard',price:Number(p.price||0),old_price:Number(p.old_price||0),stock:Number(p.stock||0)}]);
  const variantRows=rows.map((v,i)=>`<div class="variant-row card" data-variant-row style="padding:14px;margin:10px 0;background:#0f0f12;border:1px solid #27272d">
    <div class="between" style="gap:10px;align-items:center"><b>แพ็กเกจที่ ${i+1}</b><button type="button" class="btn danger" onclick="this.closest('[data-variant-row]').remove();renumberVariants()">ลบ</button></div>
    <div class="row">
      <div class="field"><label>ชื่อแพ็กเกจ</label><input name="variant_name[]" value="${esc(v.name||'')}" placeholder="เช่น 7 วัน" required></div>
      <div class="field"><label>ราคาขาย (บาท)</label><input type="number" name="variant_price[]" value="${Number(v.price||0)}" min="0" required></div>
    </div>
    <div class="row">
      <div class="field"><label>ราคาเดิม (บาท)</label><input type="number" name="variant_old_price[]" value="${Number(v.old_price||0)}" min="0"></div>
      <div class="field"><label>Stock</label><input type="number" name="variant_stock[]" value="${Number(v.stock||0)}" min="0" required></div>
    </div>
  </div>`).join('');
  return `<form class="card" style="padding:20px" method="post" enctype="multipart/form-data">
  <div class="row"><div class="field"><label>ชื่อสินค้า</label><input name="title" value="${esc(p.title||'')}" required></div><div class="field"><label>Slug</label><input name="slug" value="${esc(p.slug||'')}"><small class="muted">เว้นว่างให้สร้างอัตโนมัติ</small></div></div>
  <div class="row"><div class="field"><label>หมวด</label><input name="category" value="${esc(p.category||'ทั่วไป')}"></div><div class="field"><label>สถานะ</label><select name="status"><option ${p.status==='พร้อมขาย'?'selected':''}>พร้อมขาย</option><option ${p.status==='กำลังอัปเดต'?'selected':''}>กำลังอัปเดต</option><option ${p.status==='ปิดปรับปรุง'?'selected':''}>ปิดปรับปรุง</option></select></div></div>
  <div class="field"><label>รายละเอียด</label><textarea name="description">${esc(p.description||'')}</textarea></div>
  <div class="row"><div class="field"><label>ราคาเริ่มต้น</label><input type="number" name="price" value="${Number(p.price||0)}" min="0" required></div><div class="field"><label>ราคาเดิม</label><input type="number" name="old_price" value="${Number(p.old_price||0)}" min="0"></div></div>
  <div class="field"><label>รูปสินค้า URL (หรืออัปโหลดด้านล่าง)</label><input name="image_url" value="${esc(p.image_url||'')}"></div><div class="field"><label>อัปโหลดรูปสินค้า</label><input type="file" name="image" accept="image/*"></div>
  <div class="field"><label>ไฟล์สินค้าดิจิทัล ${p.download_file?`<span class="muted">ปัจจุบัน: ${esc(p.download_file)}</span>`:''}</label><input type="file" name="file"></div>
  <div class="row"><div class="field"><label>Stock รวม</label><input type="number" name="stock" value="${Number(p.stock||0)}" min="0"></div><div class="field"><label><input type="checkbox" name="featured" ${p.featured?'checked':''}> สินค้าแนะนำ</label><label><input type="checkbox" name="active" ${p.active===0?'':'checked'}> เปิดขาย</label></div></div>
  <h3>แพ็กเกจสินค้า</h3><p class="muted small">เพิ่มแต่ละตัวเลือกแยกกันได้ เช่น 12 ชม., 1 วัน, 7 วัน, 30 วัน, ตลอดชีพ</p>
  <div id="variant-list">${variantRows}</div>
  <div class="actions"><button type="button" class="btn purple" onclick="addVariantRow()">＋ เพิ่มแพ็กเกจ</button></div>
  <div class="actions"><button class="btn primary">บันทึกสินค้า</button><a class="btn" href="/admin/products">ยกเลิก</a></div>
  </form>
  <script>
    function renumberVariants(){document.querySelectorAll('[data-variant-row]').forEach((r,i)=>{const b=r.querySelector('b');if(b)b.textContent='แพ็กเกจที่ '+(i+1);});}
    function addVariantRow(){
      const list=document.getElementById('variant-list');
      const n=list.querySelectorAll('[data-variant-row]').length+1;
      const row=document.createElement('div'); row.className='variant-row card'; row.setAttribute('data-variant-row',''); row.style='padding:14px;margin:10px 0;background:#0f0f12;border:1px solid #27272d';
      row.innerHTML='<div class="between" style="gap:10px;align-items:center"><b>แพ็กเกจที่ '+n+'</b><button type="button" class="btn danger" onclick="this.closest(\'[data-variant-row]\').remove();renumberVariants()">ลบ</button></div>'+
      '<div class="row"><div class="field"><label>ชื่อแพ็กเกจ</label><input name="variant_name[]" placeholder="เช่น 7 วัน" required></div><div class="field"><label>ราคาขาย (บาท)</label><input type="number" name="variant_price[]" value="0" min="0" required></div></div>'+
      '<div class="row"><div class="field"><label>ราคาเดิม (บาท)</label><input type="number" name="variant_old_price[]" value="0" min="0"></div><div class="field"><label>Stock</label><input type="number" name="variant_stock[]" value="0" min="0" required></div></div>';
      list.appendChild(row);
    }
  </script>`;
}
app.get('/admin/products',admin,(req,res)=>{
  const ps=db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  res.send(adminLayout('สินค้า',`<section class="adminsection"><div class="between"><div><h1>จัดการสินค้า</h1><p class="muted">เพิ่ม แก้ไข ลบ และจัดการไฟล์สินค้า</p></div><a class="btn primary" href="/admin/products/new">＋ เพิ่มสินค้า</a></div>
  <div class="list">${ps.map(p=>`<div class="listitem between"><div class="flex"><div style="width:70px;height:55px;background:#111;border-radius:10px;overflow:hidden">${p.image_url?`<img src="${esc(p.image_url)}" style="width:100%;height:100%;object-fit:cover">`:''}</div><div><b>${esc(p.title)}</b><div class="muted small">${esc(p.category)} · ${p.active?'เปิดขาย':'ปิด'} · stock ${p.stock}</div></div></div><div class="actions"><a class="btn" href="/product/${esc(p.slug)}">ดู</a><a class="btn" href="/admin/products/${p.id}/edit">แก้ไข</a><form method="post" action="/admin/products/${p.id}/delete" onsubmit="return confirm('ลบสินค้านี้?')"><button class="btn danger">ลบ</button></form></div></div>`).join('')}</div></section>`,req));
});
app.get('/admin/products/new',admin,(req,res)=>res.send(adminLayout('เพิ่มสินค้า',`<section class="adminsection"><h1>เพิ่มสินค้า</h1>${productForm({price:0,old_price:0,stock:0,active:1,status:'พร้อมขาย'},[])}</section>`,req)));
function saveProduct(req,id=null){
  const b=req.body; const title=(b.title||'').trim(); if(!title)throw new Error('กรุณาระบุชื่อสินค้า');
  let slug=(b.slug||'').trim()||slugify(title); if(id){const x=db.prepare('SELECT id FROM products WHERE slug=? AND id!=?').get(slug,id);if(x)slug=slug+'-'+Date.now();}
  else {let x=db.prepare('SELECT id FROM products WHERE slug=?').get(slug);if(x)slug=slug+'-'+Date.now();}
  const image=req.files?.image?.[0]; const file=req.files?.file?.[0];
  const imageUrl=image?'/media/'+path.basename(image.filename):(b.image_url||'').trim();
  const price=Math.max(0,Math.trunc(Number(b.price)||0)), old=Math.max(0,Math.trunc(Number(b.old_price)||0)), stock=Math.max(0,Math.trunc(Number(b.stock)||0));
  const featured=b.featured==='on'?1:0,active=b.active==='on'?1:0,status=b.status||'พร้อมขาย';
  let pid=id;
  const tx=db.transaction(()=>{
    if(id){
      const oldp=db.prepare('SELECT * FROM products WHERE id=?').get(id);
      db.prepare(`UPDATE products SET title=?,slug=?,description=?,category=?,price=?,old_price=?,stock=?,image_url=?,download_file=?,featured=?,active=?,status=? WHERE id=?`)
        .run(title,slug,b.description||'',b.category||'ทั่วไป',price,old,stock,imageUrl,file?file.filename:oldp.download_file,featured,active,status,id);
      db.prepare('DELETE FROM product_variants WHERE product_id=?').run(id);
    }else{
      const r=db.prepare(`INSERT INTO products(title,slug,description,category,price,old_price,stock,image_url,download_file,featured,active,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(title,slug,b.description||'',b.category||'ทั่วไป',price,old,stock,imageUrl,file?file.filename:'',featured,active,status);
      pid=r.lastInsertRowid;
    }
    const names=Array.isArray(b.variant_name)?b.variant_name:(b.variant_name?[b.variant_name]:[]);
    const prices=Array.isArray(b.variant_price)?b.variant_price:(b.variant_price?[b.variant_price]:[]);
    const olds=Array.isArray(b.variant_old_price)?b.variant_old_price:(b.variant_old_price?[b.variant_old_price]:[]);
    const stocks=Array.isArray(b.variant_stock)?b.variant_stock:(b.variant_stock?[b.variant_stock]:[]);
    const ins=db.prepare('INSERT INTO product_variants(product_id,name,price,old_price,stock) VALUES(?,?,?,?,?)');
    let count=0;
    names.forEach((name,i)=>{const n=String(name||'').trim();if(!n)return;ins.run(pid,n,Math.max(0,Math.trunc(Number(prices[i])||0)),Math.max(0,Math.trunc(Number(olds[i])||0)),Math.max(0,Math.trunc(Number(stocks[i])||0)));count++;});
    if(!count) ins.run(pid,'Standard',price,old,stock);
  });
  tx(); return pid;
}
app.post('/admin/products',admin,upload.fields([{name:'image',maxCount:1},{name:'file',maxCount:1}]),(req,res)=>{try{saveProduct(req);flash(req,'success','เพิ่มสินค้าแล้ว');res.redirect('/admin/products')}catch(e){flash(req,'error',e.message);res.redirect('/admin/products/new')}});
app.get('/admin/products/:id/edit',admin,(req,res)=>{
  const p=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);if(!p)return res.status(404).send('Not found');
  const v=db.prepare('SELECT * FROM product_variants WHERE product_id=? ORDER BY id').all(p.id);
  res.send(adminLayout('แก้ไขสินค้า',`<section class="adminsection"><h1>แก้ไข: ${esc(p.title)}</h1>${productForm(p,v)}</section>`,req));
});
app.post('/admin/products/:id/edit',admin,upload.fields([{name:'image',maxCount:1},{name:'file',maxCount:1}]),(req,res)=>{try{saveProduct(req,Number(req.params.id));flash(req,'success','บันทึกสินค้าแล้ว');res.redirect('/admin/products')}catch(e){flash(req,'error',e.message);res.redirect('/admin/products/'+req.params.id+'/edit')}});
app.post('/admin/products/:id/delete',admin,(req,res)=>{
  const id=Number(req.params.id); const p=db.prepare('SELECT * FROM products WHERE id=?').get(id);if(!p)return redirectBack(req,res);
  const used=db.prepare('SELECT COUNT(*) c FROM orders WHERE product_id=?').get(id).c;if(used){flash(req,'error','ลบไม่ได้ เพราะสินค้านี้มีประวัติการสั่งซื้อ ให้ปิดการขายแทน');return redirectBack(req,res,'/admin/products');}
  db.prepare('DELETE FROM products WHERE id=?').run(id);flash(req,'success','ลบสินค้าแล้ว');res.redirect('/admin/products');
});

app.get('/admin/orders',admin,(req,res)=>{
  const os=db.prepare(`SELECT o.*,u.name,u.email,p.title,COALESCE(v.name,'Standard') variant_name FROM orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id LEFT JOIN product_variants v ON v.id=o.variant_id ORDER BY o.id DESC`).all();
  res.send(adminLayout('Orders',`<section class="adminsection"><h1>จัดการ Orders</h1><div class="tablewrap card"><table><tr><th>#</th><th>ลูกค้า</th><th>สินค้า</th><th>ยอด</th><th>ตัวแทน</th><th>สถานะ</th><th>วันที่</th><th></th></tr>${os.map(o=>`<tr><td>#${o.id}</td><td>${esc(o.name)}<div class="muted">${esc(o.email)}</div></td><td>${esc(o.title)}<div class="muted">${esc(o.variant_name)}</div></td><td>${money(o.amount)}</td><td>${o.reseller_key_id?`<span class="status green">-${o.reseller_discount_percent}%</span>`:'-'}</td><td><span class="status green">${esc(o.status)}</span></td><td>${new Date(o.created_at).toLocaleString('th-TH')}</td><td>${o.status==='paid'?`<form method="post" action="/admin/orders/${o.id}/refund" onsubmit="return confirm('คืนเงินให้ลูกค้า?')"><button class="btn danger">คืนเงิน</button></form>`:''}</td></tr>`).join('')}</table></div></section>`,req));
});
app.post('/admin/orders/:id/refund',admin,(req,res)=>{
  const tx=db.transaction(()=>{
    const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id); if(!o||o.status!=='paid')throw new Error('Order นี้ไม่สามารถคืนเงินได้');
    db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(o.amount,o.user_id);
    db.prepare('INSERT INTO wallet_transactions(user_id,amount,type,note,ref_id) VALUES(?,?,?,?,?)').run(o.user_id,o.amount,'refund','คืนเงิน Order #'+o.id,o.id);
    db.prepare("UPDATE orders SET status='refunded' WHERE id=?").run(o.id);
  });
  try{tx();flash(req,'success','คืนเงินเรียบร้อย');}catch(e){flash(req,'error',e.message)}res.redirect('/admin/orders');
});

app.get('/admin/users',admin,(req,res)=>{
  const us=db.prepare('SELECT id,name,email,role,balance,created_at FROM users ORDER BY id DESC').all();
  res.send(adminLayout('ลูกค้า',`<section class="adminsection"><h1>จัดการลูกค้า</h1><div class="tablewrap card"><table><tr><th>#</th><th>สมาชิก</th><th>ยอดเงิน</th><th>สิทธิ์</th><th>ปรับยอด</th></tr>${us.map(u=>`<tr><td>${u.id}</td><td><b>${esc(u.name)}</b><div class="muted">${esc(u.email)}</div></td><td>${money(u.balance)}</td><td>${u.role}</td><td><form method="post" action="/admin/users/${u.id}/balance" class="flex"><input type="number" name="amount" placeholder="+100 / -100" style="width:120px"><input name="note" placeholder="หมายเหตุ" style="width:160px;background:#101012;color:#fff;border:1px solid #222;border-radius:10px;padding:10px"><button class="btn">บันทึก</button></form></td></tr>`).join('')}</table></div></section>`,req));
});
app.post('/admin/users/:id/balance',admin,(req,res)=>{
  const amount=Math.trunc(Number(req.body.amount)); const id=Number(req.params.id); if(!amount){flash(req,'error','ยอดต้องไม่เป็น 0');return redirectBack(req,res);}
  const tx=db.transaction(()=>{db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(amount,id);db.prepare('INSERT INTO wallet_transactions(user_id,amount,type,note) VALUES(?,?,?,?)').run(id,amount,'admin_adjust',req.body.note||'ปรับยอดโดย Admin');});
  try{tx();flash(req,'success','ปรับยอดเรียบร้อย')}catch(e){flash(req,'error','ทำรายการไม่สำเร็จ')}redirectBack(req,res,'/admin/users');
});

app.get('/admin/topups',admin,(req,res)=>{
  const ts=db.prepare("SELECT t.*,u.name,u.email FROM topups t JOIN users u ON u.id=t.user_id ORDER BY CASE WHEN t.status='pending' THEN 0 ELSE 1 END,t.id DESC").all();
  res.send(adminLayout('เติมเงิน',`<section class="adminsection"><h1>ตรวจสอบเติมเงิน</h1><div class="tablewrap card"><table><tr><th>#</th><th>ลูกค้า</th><th>ยอด</th><th>สลิป</th><th>สถานะ</th><th>ดำเนินการ</th></tr>${ts.map(t=>`<tr><td>#${t.id}</td><td>${esc(t.name)}<div class="muted">${esc(t.email)}</div></td><td>${money(t.amount)}</td><td>${t.slip_file?`<a class="btn" href="/admin/topups/${t.id}/slip" target="_blank">ดูสลิป</a>`:'-'}</td><td><span class="status ${t.status==='approved'?'green':t.status==='rejected'?'red':'yellow'}">${esc(t.status)}</span>${t.verify_status&&t.verify_status!=='not_checked'?`<div class="muted small">ตรวจ: ${esc(t.verify_status)}${t.trans_ref?` • ${esc(t.trans_ref)}`:''}</div>`:''}</td><td>${t.status==='pending'?`<form method="post" action="/admin/topups/${t.id}" class="flex"><input name="note" placeholder="หมายเหตุ"><button name="action" value="approve" class="btn primary">อนุมัติ</button><button name="action" value="reject" class="btn danger">ปฏิเสธ</button></form>`:esc(t.note||'-')}</td></tr>`).join('')}</table></div></section>`,req));
});
app.get('/admin/topups/:id/slip',admin,(req,res)=>{
  const t=db.prepare('SELECT slip_file FROM topups WHERE id=?').get(req.params.id);
  if(!t||!t.slip_file)return res.status(404).send('ไม่พบสลิป');
  const f=path.join(UPLOAD_DIR,t.slip_file);if(!fs.existsSync(f))return res.status(404).send('ไม่พบไฟล์');
  res.sendFile(f);
});
app.post('/admin/topups/:id',admin,(req,res)=>{
  const t=db.prepare('SELECT * FROM topups WHERE id=?').get(req.params.id);if(!t||t.status!=='pending')return redirectBack(req,res,'/admin/topups');
  const action=req.body.action, note=(req.body.note||'').trim();
  const tx=db.transaction(()=>{
    if(action==='approve'){
      db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(t.amount,t.user_id);
      db.prepare('INSERT INTO wallet_transactions(user_id,amount,type,note,ref_id) VALUES(?,?,?,?,?)').run(t.user_id,t.amount,'topup','เติมเงินผ่านสลิป #'+t.id,t.id);
      db.prepare("UPDATE topups SET status='approved',note=?,reviewed_at=? WHERE id=?").run(note||'อนุมัติ',now(),t.id);
    }else{
      db.prepare("UPDATE topups SET status='rejected',note=?,reviewed_at=? WHERE id=?").run(note||'ปฏิเสธ',now(),t.id);
    }
  });
  try{tx();flash(req,'success',action==='approve'?'อนุมัติและเพิ่มเครดิตแล้ว':'ปฏิเสธรายการแล้ว')}catch(e){flash(req,'error','ดำเนินการไม่สำเร็จ')}res.redirect('/admin/topups');
});

app.get('/admin/coupons',admin,(req,res)=>{
  const cs=db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
  res.send(adminLayout('คูปอง',`<section class="adminsection"><h1>Coupon</h1><form class="card" style="padding:18px;margin-bottom:15px" method="post"><div class="row"><div class="field"><label>Code</label><input name="code" placeholder="KEN10" required></div><div class="field"><label>ประเภท</label><select name="type"><option value="percent">เปอร์เซ็นต์</option><option value="fixed">ลดเป็นบาท</option></select></div></div><div class="row"><div class="field"><label>ค่า</label><input type="number" name="value" min="1" required></div><div class="field"><label>ใช้ได้สูงสุด (0=ไม่จำกัด)</label><input type="number" name="max_uses" value="0"></div></div><div class="row"><div class="field"><label>ขั้นต่ำ</label><input type="number" name="min_amount" value="0"></div><div class="field"><label>หมดอายุ</label><input type="datetime-local" name="expires_at"></div></div><button class="btn primary">สร้างคูปอง</button></form><div class="tablewrap card"><table><tr><th>Code</th><th>ส่วนลด</th><th>ใช้แล้ว</th><th>สถานะ</th><th></th></tr>${cs.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${c.type==='percent'?c.value+'%':money(c.value)}</td><td>${c.used_count}${c.max_uses?' / '+c.max_uses:''}</td><td>${c.active?'เปิด':'ปิด'}</td><td><form method="post" action="/admin/coupons/${c.id}/toggle"><button class="btn">${c.active?'ปิด':'เปิด'}</button></form></td></tr>`).join('')}</table></div></section>`,req));
});
app.post('/admin/coupons',admin,(req,res)=>{
  try{db.prepare('INSERT INTO coupons(code,type,value,max_uses,min_amount,expires_at) VALUES(?,?,?,?,?,?)').run(String(req.body.code||'').trim().toUpperCase(),req.body.type,Math.max(0,Number(req.body.value)||0),Math.max(0,Number(req.body.max_uses)||0),Math.max(0,Number(req.body.min_amount)||0),req.body.expires_at||null);flash(req,'success','สร้างคูปองแล้ว')}catch(e){flash(req,'error','สร้างคูปองไม่ได้: code อาจซ้ำ')}res.redirect('/admin/coupons');
});
app.post('/admin/coupons/:id/toggle',admin,(req,res)=>{db.prepare('UPDATE coupons SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(req.params.id);redirectBack(req,res,'/admin/coupons');});

app.get('/admin/reseller-keys',admin,(req,res)=>{
  const ks=db.prepare('SELECT * FROM reseller_keys ORDER BY id DESC').all();
  res.send(adminLayout('คีย์ตัวแทน',`<section class="adminsection"><h1>คีย์ตัวแทน</h1><p class="muted">สร้างคีย์ให้ตัวแทนใช้รับราคาพิเศษ เช่น ลด 40%</p>
  <form method="post" action="/admin/reseller-keys" class="card" style="padding:18px;margin:18px 0"><div class="row"><div class="field"><label>ส่วนลด (%)</label><input type="number" name="discount_percent" value="40" min="1" max="90" required></div><div class="field"><label>จำนวนสมาชิกที่ใช้คีย์ได้ (1 = 1 ตัวแทน)</label><input type="number" name="max_uses" value="1" min="0"></div></div><div class="field"><label>วันหมดอายุ (ถ้ามี)</label><input type="datetime-local" name="expires_at"></div><button class="btn purple">＋ สร้างคีย์ตัวแทน</button></form>
  <div class="tablewrap card"><table><tr><th>คีย์</th><th>ส่วนลด</th><th>ใช้แล้ว</th><th>หมดอายุ</th><th>สถานะ</th><th></th></tr>${ks.map(k=>`<tr><td><b>${esc(k.code)}</b></td><td>-${k.discount_percent}%</td><td>${k.used_count}${k.max_uses?' / '+k.max_uses:''}</td><td>${k.expires_at?new Date(k.expires_at).toLocaleString('th-TH'):'ไม่หมดอายุ'}</td><td>${k.active?'<span class="status green">เปิด</span>':'<span class="status red">ปิด</span>'}</td><td><form method="post" action="/admin/reseller-keys/${k.id}/toggle"><button class="btn">${k.active?'ปิดคีย์':'เปิดคีย์'}</button></form></td></tr>`).join('')}</table></div></section>`,req));
});
app.post('/admin/reseller-keys',admin,(req,res)=>{
  const discount=Math.max(1,Math.min(90,Math.trunc(Number(req.body.discount_percent)||40)));
  const maxUses=Math.max(0,Math.trunc(Number(req.body.max_uses)||0));
  try{const code=generateResellerCode();db.prepare('INSERT INTO reseller_keys(code,discount_percent,max_uses,expires_at) VALUES(?,?,?,?)').run(code,discount,maxUses,req.body.expires_at||null);flash(req,'success','สร้างคีย์ตัวแทนแล้ว: '+code);}catch(e){flash(req,'error','สร้างคีย์ไม่สำเร็จ');}
  res.redirect('/admin/reseller-keys');
});
app.post('/admin/reseller-keys/:id/toggle',admin,(req,res)=>{db.prepare('UPDATE reseller_keys SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(req.params.id);redirectBack(req,res,'/admin/reseller-keys');});

app.get('/admin/settings',admin,(req,res)=>res.send(adminLayout('ตั้งค่าร้าน',`<section class="adminsection"><h1>ตั้งค่าร้าน</h1><form class="card" style="padding:20px" method="post" enctype="multipart/form-data">
<div class="row"><div class="field"><label>ชื่อร้าน</label><input name="store_name" value="${esc(setting('store_name'))}"></div><div class="field"><label>Tagline</label><input name="tagline" value="${esc(setting('tagline'))}"></div></div>
<div class="field"><label>ประกาศด้านบน</label><input name="announcement" value="${esc(setting('announcement'))}"></div><div class="field"><label>ช่องทางติดต่อ</label><input name="contact" value="${esc(setting('contact'))}"></div>
<div class="row"><div class="field"><label>ธนาคาร</label><input name="bank_name" value="${esc(setting('bank_name'))}"></div><div class="field"><label>ชื่อบัญชี</label><input name="bank_account_name" value="${esc(setting('bank_account_name'))}"></div></div>
<div class="field"><label>เลขบัญชี</label><input name="bank_account_number" value="${esc(setting('bank_account_number'))}"></div>
<button class="btn primary">บันทึกการตั้งค่า</button></form></section>`,req)));
app.post('/admin/settings',admin,(req,res)=>{
  for(const k of ['store_name','tagline','announcement','contact','bank_name','bank_account_name','bank_account_number'])setSetting(k,(req.body[k]||'').trim());
  db.prepare("DELETE FROM settings WHERE key='promptpay_qr'").run();
  flash(req,'success','บันทึกตั้งค่าแล้ว');res.redirect('/admin/settings');
});

app.get('/admin/categories',admin,(req,res)=>res.send(adminLayout('หมวดสินค้า',`<section class="adminsection"><h1>หมวดสินค้า</h1><form method="post" class="card" style="padding:18px"><div class="field"><label>ชื่อหมวด</label><input name="name" required></div><button class="btn primary">เพิ่มหมวด</button></form></section>`,req)));
app.post('/admin/categories',admin,(req,res)=>{try{db.prepare('INSERT INTO categories(name) VALUES(?)').run((req.body.name||'').trim());flash(req,'success','เพิ่มหมวดแล้ว')}catch(e){flash(req,'error','หมวดซ้ำ')}res.redirect('/admin/categories');});

app.get('/media/:file',(req,res)=>{
  const f=path.basename(req.params.file), full=path.join(UPLOAD_DIR,f);
  if(!fs.existsSync(full))return res.status(404).end();
  res.sendFile(full);
});
app.get('/health',(req,res)=>res.json({ok:true,service:'KEN Code Store',version:'4.0.0',time:now()}));
app.use((err,req,res,next)=>{
  console.error('KEN ERROR',err&&err.stack?err.stack:err);
  if(err instanceof multer.MulterError || err) { if(req.path.startsWith('/admin')||req.path.startsWith('/topup')){flash(req,'error',err.message||'อัปโหลดไม่สำเร็จ');return res.redirect(req.get('referer')||'/');}}
  res.status(500).send(page('Server error',`<div class="empty"><h2>เกิดข้อผิดพลาดของระบบ</h2><p class="muted">ลองใหม่อีกครั้ง</p><a class="btn" href="/">กลับหน้าแรก</a></div>`,req));
});

app.listen(PORT,()=>console.log(`KEN CODE STORE running on ${PORT}`));
