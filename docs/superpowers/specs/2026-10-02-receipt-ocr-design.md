# ถ่ายรูปบิลแล้วเติมรายการอัตโนมัติ — Design Spec

**สถานะ:** Approved in conversation on 2026-10-02

## เป้าหมาย

เพิ่มความสามารถให้ผู้ใช้ถ่ายรูปหรือเลือกรูปใบเสร็จ แล้วให้ระบบอ่านชื่อสินค้าและราคาเพื่อเติมลงในขั้นตอนกรอกรายการของ harn-tee โดยผู้ใช้ต้องตรวจสอบและยืนยันก่อนนำข้อมูลไปใช้คำนวณจริง

## บริบทของระบบปัจจุบัน

- หน้า workflow หลักอยู่ใน `app/harn-tee-client.tsx` และขั้นตอนรายการใช้ `ItemEditor` ที่ `components/harn-tee/item-editor.tsx`
- ข้อมูลรายการใช้ `ItemDraft` ใน `lib/harn-tee/types.ts` โดยเก็บราคาเป็น satang และมี `payerIds` สำหรับผู้ร่วมจ่าย
- การบันทึกบิลใช้ API และ D1 ผ่าน `app/api/bills/*` และ `db/repository.ts`
- R2 ใช้เก็บรูป QR Payment อยู่แล้ว แต่ feature นี้ไม่ควรเก็บรูปใบเสร็จเป็นข้อมูลบิล

## ขอบเขต MVP

### อยู่ในขอบเขต

- ปุ่มถ่ายรูปหรือเลือกรูปใบเสร็จในขั้นตอนกรอกรายการ
- รองรับรูปจากกล้องมือถือและรูปจาก gallery ในรูปแบบ image
- OCR ภาษาไทยและอังกฤษด้วย Tesseract.js ที่ทำงานใน browser
- ปรับภาพเบื้องต้นใน browser: หมุนตาม orientation, ย่อขนาด, grayscale และเพิ่ม contrast เท่าที่จำเป็น
- อ่านชื่อรายการและราคาที่เป็นตัวเลข พร้อมสถานะรายการที่ต้องตรวจสอบ
- หน้าตรวจสอบก่อน import: แก้ชื่อ, แก้ราคา, ลบรายการ, เพิ่มรายการเอง และยกเลิกได้
- เมื่อยืนยัน ให้สร้าง `ItemDraft` และเติมเข้า `ItemEditor`
- รายการที่ import ใหม่ตั้ง `payerIds` เป็นผู้ร่วมบิลทุกคนเหมือนรายการที่เพิ่มใหม่ในปัจจุบัน
- การสแกนครั้งถัดไปสามารถ append รายการต่อจากรายการเดิมได้
- VAT, service charge, สูตรการคำนวณ และการเลือกผู้จ่ายยังใช้ flow เดิม

### ไม่อยู่ในขอบเขต MVP

- ไม่อ่านหรือคำนวณ VAT, service charge, ส่วนลด หรือยอดรวมจากรูปโดยอัตโนมัติ
- ไม่พยายามเดาว่ารายการใดเป็นของใคร
- ไม่รองรับลายมือ, PDF, หรือการอ่านใบเสร็จหลายรูปพร้อมกันใน operation เดียว
- ไม่อัปโหลดหรือเก็บรูปใบเสร็จไว้ใน API, D1 หรือ R2
- ไม่เพิ่ม cloud OCR หรือ AI fallback ในรุ่นแรก
- ไม่สร้างประวัติรูปใบเสร็จหรือระบบบัญชีผู้ใช้ใหม่

## User Experience

### จุดเริ่มต้น

ใน `ItemEditor` เพิ่มปุ่มหลักรองจากการเพิ่มรายการปกติ ชื่อประมาณ `ถ่ายรูปใบเสร็จ` พร้อมคำอธิบายสั้น ๆ ว่า “ระบบอ่านรายการให้ แล้วตรวจสอบก่อนใช้”

ใช้ file input ที่รับ `image/*` และตั้ง `capture="environment"` เพื่อให้ browser มือถือเสนอการเปิดกล้อง แต่ยังเลือกไฟล์จากเครื่องได้

### สถานะของ scanner

`ReceiptScanner` มีสถานะที่มองเห็นได้ชัดเจน:

- `idle`: ยังไม่มีรูป
- `reading`: กำลังเตรียมภาพ/ดาวน์โหลดโมเดลครั้งแรก/กำลังอ่าน พร้อม progress ถ้ามี
- `review`: แสดงรายการที่อ่านได้
- `error`: แสดงสาเหตุและปุ่มลองใหม่หรือกลับไปกรอกเอง

ระหว่าง `reading` ป้องกันการกดซ้ำและให้ยกเลิกได้ถ้า browser ยังประมวลผลไม่เสร็จ

### หน้าตรวจสอบ

แต่ละแถวแสดง:

- ชื่อรายการแบบแก้ไขได้
- ราคาแบบแก้ไขได้ในหน่วยบาท
- ป้าย `ตรวจสอบ` เมื่อ parser หา price ไม่ได้, confidence ต่ำ หรือบรรทัดนั้นมีโอกาสเป็นยอดรวม/ส่วนลด
- ปุ่มลบรายการ

มีข้อความเตือนว่า “ระบบอ่านจากภาพ อาจคลาดเคลื่อน กรุณาตรวจสอบทุกรายการก่อนยืนยัน” และปุ่ม `เพิ่มเข้ารายการสินค้า` จะไม่บันทึกบิลทันที

## Architecture

### Client OCR service

สร้าง `lib/harn-tee/receipt-ocr.ts` เป็น client-only service ที่:

- รับ `File` และคืนผล OCR ที่มี raw text, confidence/progress และข้อมูลบรรทัดเมื่อหาได้
- สร้าง Tesseract worker แบบ lazy และ reuse worker ภายในหนึ่ง session
- ใช้ภาษา `tha+eng`
- revoke object URL หลังจบการอ่านแต่ละรูป และ terminate worker เมื่อ scanner unmount หรือ session สิ้นสุด
- ไม่เรียก `/api/bills` หรือส่ง file ไป server

โหลด module แบบ client-only/dynamic เพื่อไม่ให้ WASM และ worker ถูกประมวลผลใน server build

เพื่อความเสถียรของ production ให้พิจารณา self-host worker/core และไฟล์ traineddata `tha`/`eng` ไว้ใต้ static assets ของ site แทนการพึ่ง CDN ภายนอก โดยต้องตรวจผลกระทบต่อขนาด archive ใน implementation plan

### Parser

สร้าง `lib/harn-tee/receipt-parser.ts` เป็น pure function แยกจาก UI และ OCR engine:

- รับข้อความ OCR และคืน `ReceiptOcrItem[]`
- normalize whitespace, comma, จุดทศนิยม, สัญลักษณ์บาท และเลขไทยเป็นเลขอารบิก
- ใช้ราคาตัวเลขท้ายบรรทัดเป็น candidate หลัก
- ข้ามหรือทำเครื่องหมายบรรทัดที่มี keyword เช่น `รวม`, `subtotal`, `total`, `vat`, `ภาษี`, `service`, `ส่วนลด`, `เงินทอน`, `รับเงิน`, `ยอดสุทธิ`, `tax`, `change`
- ไม่ทิ้งข้อมูลที่อ่านไม่แน่นอน: คืนรายการสถานะ `needs-review` เพื่อให้ผู้ใช้แก้เอง
- แปลงราคาที่ผ่านการยืนยันเป็น `priceSatang`

ผลลัพธ์ภายในใช้รูปแบบนี้:

```ts
type ReceiptOcrItem = {
  id: string;
  name: string;
  priceSatang: number | null;
  rawLine: string;
  confidence: number | null;
  status: "ready" | "needs-review";
};
```

### UI integration

สร้าง `components/harn-tee/receipt-scanner.tsx` ให้รับ `participants` และ callback `onImport(items)` จากหน้าหลัก โดยหน้าหลักเป็นเจ้าของ state ของรายการเหมือนเดิม

เมื่อผู้ใช้กดยืนยัน `onImport` จะสร้าง item id/order ใหม่, ใส่ชื่อและราคา, ตั้ง `payerIds` เป็น participant ids ทั้งหมด แล้ว append เข้า draft ผ่าน `updateItem`/helper ที่ใช้ร่วมกับปุ่มเพิ่มรายการปัจจุบัน

เพิ่ม type ที่เกี่ยวข้องใน `lib/harn-tee/types.ts` แต่ไม่เปลี่ยน `BillDocument` หรือ schema D1 เพราะผลจาก OCR จะถูกแปลงเป็น `ItemDraft` ก่อนบันทึกบิล

## Privacy, limits และความปลอดภัย

- รูปใบเสร็จต้องอยู่ใน memory/object URL ของ browser เท่านั้น และต้อง cleanup หลังใช้งาน
- ไม่ส่งรูปใน request ใด ๆ ไปยัง backend
- รับเฉพาะ image และจำกัดขนาดไฟล์เริ่มต้นที่ 10 MB
- แปลงรูปจากมือถือ เช่น HEIC ที่ browser รองรับ ให้เป็น JPEG ที่ OCR รองรับก่อนประมวลผล หากแปลงไม่ได้ให้แสดง error ที่แก้ไขได้
- ไม่แสดง raw OCR ยาว ๆ ใน production UI ยกเว้นอยู่ในรายละเอียดที่ช่วยตรวจสอบรายการ
- หากเพิ่ม cloud fallback ในอนาคต ต้องเป็น opt-in พร้อมข้อความแจ้งว่าจะส่งรูปออกนอกเครื่อง และต้องมี quota/error boundary แยกจาก MVP

## Error handling

- ไฟล์ไม่ใช่ภาพหรือใหญ่เกินกำหนด: แจ้งสาเหตุและให้เลือกใหม่
- โหลด worker/model ไม่สำเร็จ: แจ้งให้ลองใหม่หรือกรอกเอง โดยไม่ทำให้ขั้นตอนบิลค้าง
- OCR ไม่พบข้อความ: แสดงสถานะ “อ่านไม่พบรายการ” และปุ่มกลับไปกรอกเอง
- พบแต่ข้อความไม่มีราคา: แสดงแถวที่ต้องตรวจสอบ แทนการทิ้งทั้งหมด
- parser พบยอดรวม/ส่วนลดที่น่าสงสัย: ทำเครื่องหมายให้ผู้ใช้ลบหรือแก้ ไม่ import เงียบ ๆ
- ผู้ใช้ปิด scanner ระหว่างประมวลผล: terminate worker/revoke URL และคง draft เดิมไว้

## Accessibility และ responsive behavior

- ปุ่มและ input ทุกตัวมี accessible name ภาษาไทย
- progress ต้องประกาศสถานะให้ screen reader ได้
- ใช้ layout แบบ single column บนมือถือ และไม่ให้ตาราง review ล้นแนวนอนที่ 360px
- ช่องราคาใช้ input mode แบบ decimal และแสดงหน่วยบาทเหมือน `ItemEditor`
- keyboard สามารถเปิด file picker, แก้รายการ, ลบแถว และยืนยันได้

## Acceptance criteria

1. ผู้ใช้บนมือถือสามารถเปิดกล้องหรือเลือกภาพใบเสร็จได้จากขั้นตอนรายการ
2. รูปไม่ถูกส่งไป backend ระหว่าง OCR
3. ระบบอ่านใบเสร็จไทย/อังกฤษและแสดงผลเป็นรายการแก้ไขได้
4. รายการที่ไม่มั่นใจถูกทำเครื่องหมายและไม่ทำให้ flow ล้มเหลว
5. ผู้ใช้ต้องกดยืนยันก่อนรายการเข้า `ItemEditor`
6. รายการที่ import มี `priceSatang` ถูกต้องหลังยืนยัน และ payer เริ่มต้นเป็นทุกคน
7. VAT, service charge, สูตรคำนวณ และการแชร์บิลเดิมยังทำงานเหมือนเดิม
8. การยกเลิก/อ่านไม่สำเร็จไม่ทำให้ draft เดิมเสียหาย
9. ไม่มี horizontal overflow ที่ mobile viewport 360px
10. test, lint, TypeScript และ production build ผ่าน

## Testing strategy

- Unit tests สำหรับ normalization และ parser ด้วย fixture ข้อความไทย/อังกฤษ, comma, decimal, เลขไทย, บรรทัด total/VAT/discount และบรรทัดที่ไม่มีราคา
- Unit tests สำหรับการแปลง `ReceiptOcrItem` ที่ยืนยันแล้วเป็น `ItemDraft`
- Component/integration tests สำหรับ state `idle → reading → review → import/error/cancel`
- ตรวจว่า scanner ไม่เรียก bill API และไม่ใส่ข้อมูลลง draft ก่อนยืนยัน
- Browser smoke test บน 360px และ desktop เพื่อยืนยัน file picker, review panel, keyboard flow และไม่มี overflow
- รัน `npm test`, `npm run lint`, `npx tsc --noEmit` และ `npm run build`

## Future extension

หากผล OCR ในใบเสร็จจริงไม่แม่นพอ ให้เพิ่ม provider interface แยกจาก `ReceiptScanner` เพื่อรองรับ cloud fallback ภายหลัง โดยต้องคง contract ของ review/import เดิมและขอ consent ก่อนส่งรูปออกนอกเครื่อง
