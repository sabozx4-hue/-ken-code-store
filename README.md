# KEN CODE STORE v4.4 — Auto Slip Verification

ระบบร้าน KEN Code Store พร้อมระบบตรวจสอบสลิปธนาคารอัตโนมัติผ่าน EasySlip API v2

## ระบบเติมเงินอัตโนมัติ

ลูกค้าอัปโหลดสลิป → KEN ส่งรูปไป EasySlip → ตรวจสอบว่า:
- สลิปถูกต้อง
- ยอดเงินตรงกับยอดที่ลูกค้าแจ้ง
- สลิปไม่ซ้ำ
- บัญชีผู้รับตรงกับบัญชีที่ลงทะเบียนไว้ใน EasySlip

ถ้าผ่านครบ ระบบจะอนุมัติและเติม KEN COIN ให้อัตโนมัติทันที
ถ้าไม่ผ่าน รายการจะค้างไว้ให้ Admin ตรวจสอบเอง

## ตั้งค่า Railway Variables

ต้องสร้าง API Key จาก EasySlip Developer Portal แล้วใส่ใน Railway Variables:

- `EASYSLIP_API_KEY` = API Key ของคุณ
- `EASYSLIP_MATCH_ACCOUNT` = `true`
- `EASYSLIP_AUTO_APPROVE` = `true` (ระบบเวอร์ชันนี้ออกแบบให้อนุมัติอัตโนมัติเมื่อผ่านทุกเงื่อนไข)

EasySlip ใช้ API v2 ที่ endpoint `https://api.easyslip.com/v2/verify/bank` และรองรับตรวจจากรูปสลิปโดยตรง พร้อมตรวจยอดและสลิปซ้ำ

สำคัญ: ใน EasySlip Developer Portal ต้องลงทะเบียน/เชื่อมบัญชีรับเงินของร้านก่อนเปิด `EASYSLIP_MATCH_ACCOUNT=true` ไม่เช่นนั้นระบบจะไม่ auto-approve เพื่อความปลอดภัย

## ข้อจำกัด

- EasySlip เป็นบริการภายนอกและต้องมี API Key/โควต้าตามแพ็กเกจของผู้ให้บริการ
- รูปสลิปที่ส่งให้ระบบตรวจต้องไม่เกิน 4 MB และควรเป็น JPG/PNG/WebP
- หาก EasySlip ขัดข้องหรือโควต้าหมด ระบบจะไม่เติมเงินอัตโนมัติ แต่เก็บรายการไว้ให้ Admin ตรวจเอง
- อย่าใส่ API Key ในโค้ด GitHub ให้เก็บใน Railway Variables เท่านั้น

## Admin

Admin เดิมของระบบใช้ตามค่า `ADMIN_EMAIL` / `ADMIN_PASSWORD` ที่ตั้งไว้ใน Railway

## Run

`npm install`
`npm start`


## ข้อมูลรับเงินปัจจุบัน
- ธนาคาร: กสิกรไทย
- ชื่อบัญชี: พงศกร สุขสะอาด
- เลขบัญชี: 1691369036
- ปิดการแสดงและการอัปโหลด PromptPay QR แล้ว
