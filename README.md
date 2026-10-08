# KEN CODE STORE 4.0.0

เว็บร้านค้าดิจิทัลแบบครบระบบสำหรับ Source Code / Script / Website / Bot
ออกแบบ Mobile-first โทนดำ Premium และใช้ KEN COIN เป็น Wallet

## ระบบหน้าร้าน
- หน้าแรก / สินค้าแนะนำ / หมวดสินค้า
- ค้นหาและกรองสินค้า
- หน้ารายละเอียดสินค้า
- สินค้าหลายแพ็กเกจ/Variants เช่น 1 วัน, 7 วัน, Lifetime
- ราคาเดิม / ราคาโปร
- Stock และสถานะสินค้า
- สมัครสมาชิก / เข้าสู่ระบบ / ออกจากระบบ
- Wallet / KEN COIN
- เติมเงินด้วย PromptPay QR หรือโอนธนาคาร
- อัปโหลดสลิป
- ประวัติการเติมเงินและประวัติเงิน
- ซื้อสินค้าด้วย Wallet
- Coupon / ส่วนลด
- Order history
- ดาวน์โหลดไฟล์หลังซื้อ
- โปรไฟล์สมาชิก

## ระบบ Admin
เข้า `/admin`

- Dashboard: ลูกค้า / สินค้า / Orders / ยอดขาย / รายการเติมเงินรอตรวจ
- เพิ่ม / แก้ไข / ปิดขาย / ลบสินค้า
- รูปสินค้า URL หรืออัปโหลดรูป
- อัปโหลดไฟล์ดิจิทัล
- สร้างหลายแพ็กเกจและกำหนดราคา/Stock
- จัดการ Orders
- คืนเงินเข้า Wallet
- จัดการสมาชิก
- เพิ่ม/ลด Wallet พร้อมบันทึกธุรกรรม
- ตรวจสลิปเติมเงิน
- อนุมัติ/ปฏิเสธรายการเติมเงิน
- สร้าง/ปิด Coupon
- ตั้งค่าชื่อร้าน / ประกาศ / ธนาคาร / เลขบัญชี / QR
- Health check `/health`

## Admin เริ่มต้น
Email: `admin@ken.local`
Password: `admin123`

ควรตั้ง Railway Variables:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

## Deploy Railway
อัปโหลด `server.js` และ `package.json` ไปยัง root ของ GitHub repository แล้วให้ Railway Deploy

จากนั้น Service > Settings > Networking > Generate Domain

ทดสอบ:
- `/health`
- `/`
- `/admin`

### สำคัญสำหรับการขายจริง
ระบบใช้ SQLite และไฟล์อัปโหลด ดังนั้นควรสร้าง Railway Volume แล้วกำหนด:
- `DATA_DIR=/data`
- `UPLOAD_DIR=/data/uploads`

และ Mount Path ของ Volume เป็น `/data`

ถ้าไม่ใช้ Volume ข้อมูล SQLite และไฟล์อัปโหลดอาจหายเมื่อ service ถูกสร้างใหม่/redeploy

## หมายเหตุการชำระเงิน
การเติมเงินผ่านสลิปเป็นการตรวจสอบโดย Admin:
ลูกค้าโอน > อัปโหลดสลิป > Admin ตรวจ > กดอนุมัติ > ระบบเพิ่ม KEN COIN อัตโนมัติ

ระบบไม่ได้อ้างว่าเชื่อมธนาคารเพื่อยืนยันยอดแบบอัตโนมัติ เว้นแต่จะเพิ่ม Payment Gateway/API ภายนอกในภายหลัง
