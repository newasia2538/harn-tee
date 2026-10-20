# แนวทางปรับปรุง receipt OCR ของ harn-tee

ตรวจข้อมูลวันที่ 2026-10-20 จากเอกสารและ source ทางการเท่านั้น; ข้อเสนอเป็นลำดับการทดลอง ไม่ใช่ผลวัดความแม่นยำ งานนี้เป็น research เท่านั้น ไม่แก้ app/tests/packages และไม่ส่งรูปใบเสร็จออกไปภายนอก

ข้อเสนอหลัก: แก้การรับ structured output ของ Tesseract.js v7 และแยกรายการด้วยตำแหน่งคอลัมน์กับบริบทตัวเลขก่อน จากนั้นปรับ crop/deskew/ความละเอียดและอ่านซ้ำเฉพาะบริเวณที่น่าสงสัย คงการประมวลผลใน browser เป็นค่าเริ่มต้น แล้ว benchmark ก่อนตัดสินใจเปลี่ยน engine หรือเพิ่ม cloud แบบผู้ใช้ยินยอม

## หลักฐานจากโปรเจกต์

- ติดตั้ง `tesseract.js@7.0.0`; [receipt-ocr.ts:148](/Users/11356979/vibe-code-projects/harn-tee-web/lib/harn-tee/receipt-ocr.ts:148) เรียก `recognize(image)` แล้วอ่าน `data.lines` ซึ่งไม่มีใน `Page` ของ v7 จึงตกไปใช้ raw text พร้อม `confidence:null` โดยปกติ; parser ไม่ถือว่า confidence ที่หายไปเป็นคำเตือน
- [preprocessing:84](/Users/11356979/vibe-code-projects/harn-tee-web/lib/harn-tee/receipt-ocr.ts:84) ย่อด้านยาวเหลือ 2000px แล้ว grayscale/contrast 115% และ JPEG 0.92 เช่น 1200×6000 → 400×2000px มีความเสี่ยงสูญเสียรายละเอียดอักษรเล็ก แต่ยังไม่ได้วัดผลจริง
- [OCR test:49](/Users/11356979/vibe-code-projects/harn-tee-web/tests/harn-tee/receipt-ocr.test.ts:49) mock `data.lines` แบบเก่า; Node tests ข้าม browser preprocessing และไม่มี image fixtures ผลการรันชุดทดสอบปัจจุบัน: 4 test files ผ่าน 19 tests จึงยังใช้ยืนยันคุณภาพ OCR จากภาพไม่ได้

ผลทดสอบ `parseReceiptLines` ตัวจริงโดยไม่แก้โค้ดได้ดังนี้ สอดคล้องกับ [parser:32](/Users/11356979/vibe-code-projects/harn-tee-web/lib/harn-tee/receipt-parser.ts:32):

| ข้อความเข้า | ผลปัจจุบัน |
| --- | --- |
| `โทร 0812345678` | `ready`, ราคา 812345678 บาท |
| `วันที่ 20/10/2026` | `ready`, ราคา 2026 บาท |
| `100.00` | `ready`, ชื่อ `100.00`, ราคา 100 บาท |
| `Discount -20.00` | `ready`, ราคาเป็นบวก 20 บาท |
| `Cash 500.00` | `ready`, ราคา 500 บาท |
| `ชาเย็น 70.00 2` | `ready`, ราคา 2 บาท |
| `ข้าวผัด 89.00 T` | `needs-review`, ไม่มีราคา |

บรรทัดเลขผู้เสียภาษีภาษาไทยที่ตรวจเป็น `needs-review` อยู่แล้ว เพราะมีคำว่า `ภาษี`; ไม่ใช่ตัวอย่าง false-ready

## ลำดับที่ควรทำ

### 1. รับ output ของ v7 ให้ถูก แล้วใช้ geometry ใน parser

ตั้งแต่ v6 output รูปแบบอื่นนอกจาก text ปิดเป็นค่าเริ่มต้น และไม่มี flattened `data.lines`/`data.words` ให้ใช้โดยตรง ต้องเปิด `blocks` แล้วเดิน `blocks → paragraphs → lines → words` เอง; v7 ยังใช้สัญญานี้ ([v6 migration โดย maintainer](https://github.com/naptha/tesseract.js/issues/993), [v7 defaults](https://github.com/naptha/tesseract.js/blob/v7.0.0/src/worker-script/constants/defaultOutput.js)) ตัวอย่างแนวทาง:

```ts
const { data } = await worker.recognize(image, {}, { blocks: true });
const lines = (data.blocks ?? [])
  .flatMap(block => block.paragraphs)
  .flatMap(paragraph => paragraph.lines);
// เก็บ line.bbox และ line.words[].{text,bbox,confidence} ไปถึง extraction
```

`Line`, `Word`, `Symbol` มี `bbox` และ `confidence`; ไม่มี switch `words:true` หรือ `confidence:true` ที่ต้องเปิดเพิ่มเพื่อรับ word confidence ผ่าน blocks ส่วน `data.confidence` เป็นค่าเฉลี่ยระดับหน้าและคืนได้แม้ไม่เปิด blocks ([v7 types](https://github.com/naptha/tesseract.js/blob/v7.0.0/src/index.d.ts), [output implementation](https://github.com/naptha/tesseract.js/blob/v7.0.0/src/worker-script/utils/dump.js)) เปิดเฉพาะ output ที่ใช้; ไม่จำเป็นต้องเปิด hOCR/TSV พร้อมกัน

ข้อเสนอด้าน extraction จากหลักฐาน local: จัดกลุ่มคำตามแนวแถวและคอลัมน์ แยกชื่อ/quantity/unit price/line amount ตาม layout ของบิล รองรับชื่อหลายบรรทัด และแยก date/phone/tax ID/payment/change/subtotal/tax/service/discount ออกจากรายการสินค้า รักษาเครื่องหมายลบและบริบท `%`; tax marker เช่น `T` หลังราคาไม่ควรทำให้ราคาหาย อย่าใช้เลขท้ายบรรทัดเป็นกฎตัดสินเพียงอย่างเดียว และอย่าบังคับเลือกทุกตัวเลขด้านขวาเป็นราคา

ให้ `confidence:null`, ตัวเลือกหลายราคา หรือหลักฐานขัดกันเข้า review; ใช้ confidence ของคำที่เป็นราคาเป็นสัญญาณร่วมกับบริบท ไม่แทนด้วยคะแนนเฉลี่ยหน้าและไม่ตีความเป็นความน่าจะเป็นที่รับประกันความถูกต้อง เปรียบเทียบผลรวม line amounts กับ subtotal แล้วใช้เฉพาะ tax/service/discount ที่อ่านได้และเข้าใจรูปแบบรวมภาษีเพื่อเช็ก grand total ยอดตรงกันเป็นเพียง consistency check ห้ามอนุมานหรือเปลี่ยนราคาเพื่อบังคับให้ยอดลงตัว

ในรอบแรก ข้อมูล subtotal/tax/service ใช้เพื่อตรวจสอบความสอดคล้องของผลอ่านเท่านั้น คงช่อง VAT/Service charge และการยืนยันของผู้ใช้ตาม flow ปัจจุบัน เพื่อป้องกันนำค่าธรรมเนียมจากภาพมาคิดซ้ำกับค่าที่ผู้ใช้กรอก

ใช้ type `Worker`/ผลลัพธ์จาก library รุ่นที่ติดตั้ง แทน type จำลองที่อนุญาต `data.lines` และใช้ fixture ตามโครงสร้าง v7 ใน contract tests เพื่อจับ API ที่เปลี่ยนไป ในหน้าตรวจสอบ ควรแสดง crop ของรายการควบคู่ช่องที่อ่านได้และบอกเหตุผลที่ต้องตรวจ เช่น ราคาไม่มั่นใจหรือแยกจำนวนไม่ได้ การแก้ชื่ออย่างเดียวไม่ควรล้างคำเตือนของราคาที่ผู้ใช้ยังไม่ได้ตรวจ รูปยังอยู่เฉพาะใน browser และถูก cleanup หลังจบการตรวจสอบ

### 2. รักษารายละเอียดภาพ และอ่านซ้ำอย่างมีเงื่อนไข

ทดลอง crop เฉพาะใบเสร็จพร้อมขอบขาวเล็กน้อย แก้เอียง/มุมถ่าย และเก็บต้นฉบับไว้ในหน่วยความจำเพื่อ re-read แทนย่อบิลยาวทุกใบเหลือ 2000px ทันที เปรียบเทียบภาพเดิมกับ grayscale และ threshold แบบ adaptive สำหรับเงา/พื้นหลังไม่สม่ำเสมอ; ไม่ตั้ง contrast/threshold เดียวให้ทุกภาพ Tesseract มี Otsu ภายใน และรุ่น 5 เพิ่ม Adaptive Otsu/Sauvola; เอกสารแนะนำภาพคมชัดและตัวอักษรแนวนอน ([official image-quality guide](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html))

ทดลองส่ง canvas หรือ PNG เพื่อเลี่ยง JPEG encode ซ้ำ; API รับ canvas/Blob ได้ ([v7 input types](https://github.com/naptha/tesseract.js/blob/v7.0.0/src/index.d.ts)) เมื่อ low confidence/ราคาไม่ชัด/ยอดขัดกัน ค่อย re-read crop จากต้นฉบับด้วยภาพละเอียดหรือ preprocessing อีกแบบ จำกัดจำนวนรอบเพื่อคุมเวลาและ memory; ผลดีจริงยังไม่ทราบ การ upsample หรือกำหนด DPI ไม่สร้างรายละเอียดที่สูญหายกลับมา

### 3. ทดลอง PSM/data แบบจำกัดตัวแปร

- Tesseract.js ระบุ default เป็น `PSM.SINGLE_BLOCK` (6) ต่างจาก Tesseract CLI default 3 จึงอย่าสมมติว่าตอนนี้เป็น AUTO ทดลอง 4 (single column) เทียบ 6 สำหรับบิลเต็ม และ 7/13 สำหรับ crop หนึ่งบรรทัด; sparse mode 11 ไม่รับประกันลำดับการอ่าน `preserve_interword_spaces` อาจช่วย text fallback แต่ geometry สำคัญกว่า ([v7 API](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/api.md), [PSM guide](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html#page-segmentation-method))
- `rotateAuto:true` หา skew angle แต่ไม่แก้ perspective; `worker.detect()` เป็น OSD อีก API ซึ่งต้องเปิด `legacyCore`/`legacyLang` และเพิ่มทรัพยากร ([rotation implementation](https://github.com/naptha/tesseract.js/blob/v7.0.0/src/worker-script/index.js), [detect API](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/api.md#worker-detect))
- ทดลอง `load_system_dawg:'0'`/`load_freq_dawg:'0'` เฉพาะเมื่อชื่อสินค้า/รหัสไม่เหมือนคำในพจนานุกรม ต้องส่งใน config อาร์กิวเมนต์ที่ 4 ของ `createWorker` เพราะเป็น init-only; ใช้ digit whitelist เฉพาะ price crop ที่ยืนยันแล้ว ไม่ใช้กับชื่อสินค้าไทย ([dictionary guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html#dictionaries-word-lists-and-patterns), [initialization API](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/api.md#create-worker))
- `createWorker('tha+eng',1)` ใช้ LSTM และ default data คือ `4.0.0_best_int` อยู่แล้ว ไม่ใช่ fast model; float `tessdata_best` เป็นการทดลองอันดับรอง maintainer ระบุว่ามีขนาด/เวลามากขึ้นและผลต่างอาจน้อยมาก; `tessdata_fast` แลกคุณภาพกับความเร็ว ([official data repository](https://github.com/naptha/tessdata#language-data), [Tesseract data variants](https://tesseract-ocr.github.io/tessdoc/Data-Files.html))

คง worker reuse ที่มีอยู่และ language-data cache; จำกัด workers บนมือถือเพราะแต่ละตัวใช้ memory มาก ([performance guidance](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/performance.md)) การอัปเกรด wrapper อย่างเดียวไม่มีหลักฐานว่าจะเพิ่มความแม่นยำของบิลนี้

## ทางเลือก engine และต้นทุน

| ทางเลือก | ภาษาไทย/ความเป็นไปได้ | Privacy และต้นทุนที่ต้องนับ |
| --- | --- | --- |
| ปรับ Tesseract.js เดิม | อยู่ใน stack แล้ว; แก้ output/extraction ได้ก่อนเปลี่ยน engine | ไม่มีค่า OCR API; ใช้ CPU/RAM/แบตเตอรี่ผู้ใช้และ bandwidth โฮสต์ model/WASM |
| PaddleOCR บนเครื่องหรือ self-host | `th_PP-OCRv5_mobile_rec` รองรับ Thai + English; Python mapping รองรับ `lang='th'` กับ PP-OCRv5 และเลือก detector ได้; รองรับ CPU/GPU | รัน local ได้หลังติดตั้ง/model download; หาก self-host รับรูปผ่าน server จึงไม่ใช่ browser-only มีค่าเครื่อง/compute/RAM/ดูแลระบบแม้ซอฟต์แวร์ Apache-2.0 |
| PaddleOCR.js ใน browser | SDK ทางการใช้ ONNX Runtime/OpenCV.js ได้ แต่ **Thai ยังไม่ใช่ built-in language mapping** ที่ตรวจพบ ต้องทดลอง custom Thai ONNX + dictionary/config | คงรูปใน browser ได้หากโค้ดไม่ upload; มีค่า static assets และต้นทุน download/หน่วยความจำ/เวลาเครื่องผู้ใช้ ต้องทดสอบ mobile และการตั้งค่า runtime |
| Google Cloud Vision `DOCUMENT_TEXT_DETECTION` แบบ opt-in | รองรับ Thai (`th`) และหลายภาษาในภาพ; คืน OCR/layout แต่ยังต้องใช้ receipt parser | ส่งภาพออกไป provider; มีค่า API และ backend proxy/hosting แยก ต้องเก็บ credentials ฝั่ง server และขอ consent ก่อนส่ง |

หลักฐาน Paddle: [Thai/English model](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html#5-models-and-their-supported-languages), [Python language mapping](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr/_pipelines/ocr.py), [CPU/GPU และ result geometry](https://www.paddleocr.ai/v3.3.0/en/version3.x/pipeline_usage/OCR.html), [license](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE) ควร pin รุ่น/package และชื่อ model ที่ทดลอง เพราะ default ของรุ่นใหม่และเอกสารบางหน้าต่างกัน

ข้อจำกัด browser ของ Paddle: [language-selection source](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/src/pipelines/ocr/shared.ts) ไม่มี `th` และ [asset registry](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/src/resources/model-asset.ts) ไม่มี Thai model สำเร็จรูป จึงเรียก `lang:'th'` ตาม Python ไม่ได้ [SDK](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md) รับ custom ONNX/config ได้ แต่ Thai export/dictionary compatibility, mobile runtime และ memory ยังไม่ได้พิสูจน์ จัดเป็นการทดลองภายหลัง ไม่ถือว่าพร้อมแทน engine เดิมทันที

### Cloud ที่คุ้มพอจะทดลองเมื่อผู้ใช้ยินยอม

Google Vision `DOCUMENT_TEXT_DETECTION` รองรับ [Thai](https://docs.cloud.google.com/vision/docs/languages) แต่ยังต้องใช้ receipt parser [ราคาทางการ](https://cloud.google.com/vision/pricing) ที่ตรวจ (USD): ฟรี 1,000 units แรก/เดือน; units 1,001–5,000,000 ราคา **$1.50/1,000 units** หนึ่ง feature ต่อหนึ่งภาพคิดหนึ่ง unit; retries มีผลต่อ usage โควตานี้ไม่ใช่สิทธิ์ฟรีแยกต่อผู้ใช้ harn-tee ยังไม่รวม proxy/hosting/storage/ภาษี และต้อง [เปิด billing/authentication](https://docs.cloud.google.com/vision/docs/setup)

[Data Usage FAQ](https://docs.cloud.google.com/vision/docs/data-usage) ระบุว่า online operations ประมวลผลภาพใน memory ไม่ persist ลง disk และไม่ใช้ content ฝึก/ปรับปรุง Vision; ยังมี metadata logs ชั่วคราว ข้อเสนอคือ synchronous request ผ่าน backend หลัง consent พร้อมเก็บ credentials ฝั่ง server และไม่ log ภาพ/raw OCR text ส่วน Tesseract browser สามารถ [โฮสต์ model assets เอง](https://github.com/naptha/tessdata#local-copy); ดาวน์โหลด model ไม่จำเป็นต้อง upload รูปให้ CDN

ต้นทุน hosting จริงยังไม่ทราบและยังไม่ได้ตรวจ plan ของ harn-tee/Sites จึง **ไม่ถือว่า Sites ได้ Cloudflare Free quotas** ค่า license/API เป็นศูนย์ไม่ได้แปลว่า compute, bandwidth และงานดูแลระบบเป็นศูนย์

## หลักฐานที่ต้องมีเพื่อเลือกแนวทาง

ยังไม่มีภาพใบเสร็จจริงหรือ ground truth จึงไม่สามารถระบุเปอร์เซ็นต์ความแม่นยำ/การปรับปรุง อันดับ engine หรือ latency จริงจากงานนี้ได้ ผล benchmark ทั่วไปของผู้ผลิตไม่ใช่ผลของบิลไทยใน harn-tee

สร้างชุดภาพที่ผู้ใช้อนุญาตให้ทดสอบในเครื่อง ครอบคลุมไทย/อังกฤษ บิลยาว อักษรเล็ก เงา เอียง กระดาษจาง หลายคอลัมน์ quantity/discount/VAT/service และบันทึก ground truth ที่มีคนตรวจ เทียบ baseline → structured output/extraction → image/PSM retry → Paddle; ทดสอบ cloud เฉพาะภาพที่มี consent แยก

วัด **exact price accuracy** ของรายการที่จับคู่ได้ พร้อม **item precision/recall** เพื่อไม่ซ่อนรายการที่หายไป, จำนวน manual corrections/receipt, จำนวนรายการผิดที่ถูกจัด `ready` ทั้งเมื่อ confidence ต่ำและหายไป, runtime แบบ cold/warm (median/p95) และ peak memory บนมือถือจริง แยกผล character recognition ออกจาก item extraction; ใช้ holdout สำหรับตัดสินเลือก config และเก็บกรณี parser probes ข้างต้นเป็น regression cases ข้อเสนอการเปลี่ยน engine ควรอาศัยผลชุดนี้รวมกับเวลาที่ผู้ใช้ต้องแก้บิล ไม่ใช่คะแนน confidence หรือยอดรวมตรงอย่างเดียว
