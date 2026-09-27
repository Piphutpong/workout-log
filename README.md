# Workout Log

เว็บแอป (PWA) บันทึกการออกกำลังกาย แผนวิ่ง โภชนาการ และพัฒนาการของร่างกาย สำหรับผู้ใช้คนเดียว

- React + Vite + TypeScript + Tailwind, TanStack Query, React Hook Form + Zod
- Supabase (PostgreSQL + Auth + Storage) แพ็กเกจฟรี — ใช้แค่ anon key + Row Level Security
- Deploy บน GitHub Pages ผ่าน GitHub Actions, ติดตั้งลงหน้าจอหลักได้ (PWA) และบันทึกแบบออฟไลน์ได้

> **สถานะ:**
> - Phase 1 ✅ วันนี้, น้ำหนักตัว, บันทึกเวท, จัดการโปรแกรม, บันทึกวิ่ง, แผนวิ่ง, interval timer, offline queue
> - Phase 2 ✅ Dashboard, เป้าหมาย, กราฟความก้าวหน้า, ประวัติ (แก้/ลบ/Undo), Check-in, อาการเจ็บ, Body comp, รูปความก้าวหน้า,
>   สรุปรายสัปดาห์ตามกฎข้อ 6, PR/Achievements, โปรแกรม "กระชับกล้ามเนื้อ (นายแบบ)" 3 วันจากหนังสือ
> - Phase 3 ✅ คลังอาหารไทย 95 รายการ (ค่าประมาณ), บันทึกอาหาร ≤ 3 แตะ, เหมือนเมื่อวาน/meal template/Quick add,
>   สแกนบาร์โค้ด (Open Food Facts), สูตรอาหาร, เป้าตามประเภทวัน, คำแนะนำตามส่วนที่ขาด, น้ำ, อาหารเสริม, Adaptive TDEE, กราฟโภชนาการ
> - Phase 4 ✅ รองเท้า (เตือน 90%), อุณหภูมิ/ความชื้นจาก Open-Meteo, import .gpx/.fit/.tcx พร้อม splits, deload, แก้ warm-up,
>   คลังท่า, แจ้งเตือนตามกฎข้อ 6, อีเมล (Resend) + Web Push ผ่าน Edge Function + pg_cron, Export JSON/CSV, Import JSON, backup รายสัปดาห์

---

## โครงสร้าง

```
src/
  pages/           หน้าทั่วไป (เพิ่มเติม/ตั้งค่า)
  components/      UI กลาง (ปุ่ม, การ์ด, modal, ลากเรียงลำดับ)
  features/
    auth/ onboarding/ today/ workout/ run/   ← Phase 1
    nutrition/ body/ goals/ dashboard/        ← Phase 2-3
  lib/             supabase client, calc (สูตร), date (Asia/Bangkok), offline (IndexedDB queue)
  types/           database.ts (types ของ schema)
supabase/
  migrations/      SQL migration (ห้ามแก้ไฟล์เดิม ให้เพิ่มไฟล์ใหม่)
  seed.sql         แผนวิ่ง FASTBULL (สร้างจาก seed_run_plans.json)
  seed_run_plans.json
  RUN_PLANS_REVIEW.md   วันที่ต้องตรวจสอบ
scripts/           build-run-plans, build-seed-sql, check-migrations (PGlite), gen-icons
```

---

## ติดตั้งและใช้งาน (Windows ทีละขั้น)

### 1. ติดตั้งโปรแกรม
เปิด **PowerShell** แล้วรัน:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

ปิดแล้วเปิด PowerShell ใหม่ ตรวจสอบ:

```powershell
node -v   # ควรเป็น v20 ขึ้นไป
git --version
```

**Supabase CLI** ติดตั้งมากับโปรเจกต์แล้ว (เรียกผ่าน `npx supabase ...`) ไม่ต้องติดตั้งแยก

### 2. ติดตั้ง dependency

```powershell
cd "D:\OneDrive\Claude\Claude Code\ExerciseTracking"
npm install
```

### 3. สร้างโปรเจกต์ Supabase
1. สมัคร/ล็อกอินที่ https://supabase.com → **New project**
2. ตั้งชื่อ เช่น `workout-log`, Region **Southeast Asia (Singapore)**, ตั้ง Database password (จดไว้)
3. รอสร้างเสร็จ แล้วไปที่ **Project Settings → General** จด **Reference ID** (เช่น `abcdxyz123`)
4. ไปที่ **Project Settings → API** จด **Project URL** และ **anon public key**
   (อย่าใช้ `service_role` key ในแอปเด็ดขาด)

### 4. รัน migration + seed

```powershell
npx supabase login
npx supabase link --project-ref <Reference ID>
npx supabase db push --include-seed
```

- `db push` จะสร้างตารางทั้งหมด, RLS, views/functions, ฟังก์ชัน `bootstrap_user` และ Storage bucket
- `--include-seed` จะใส่แผนวิ่ง FASTBULL ทั้ง 5 แผน (434 วัน) จาก `supabase/seed.sql`

> **ทางเลือก (ไม่ใช้ CLI):** เปิด Supabase → **SQL Editor** แล้ววางเนื้อหาไฟล์ใน `supabase/migrations/` ทีละไฟล์ตามลำดับชื่อ กด Run
> จากนั้นวาง `supabase/seed.sql` แล้ว Run

ข้อมูลส่วนตัว (ส่วนสูง, InBody, เป้าหมาย, โปรแกรม A/B/Rehab, ตารางสัปดาห์, เป้าโภชนาการ, อาหารเสริม) จะถูกสร้าง**อัตโนมัติ**ตอนล็อกอินครั้งแรก

### 5. สร้างผู้ใช้
1. Supabase → **Authentication → Users → Add user → Create new user**
2. ใส่อีเมล + รหัสผ่าน ติ๊ก **Auto Confirm User**
3. (แนะนำ) **Authentication → Sign In / Providers** ปิด **Allow new users to sign up** เพื่อไม่ให้คนอื่นสมัครได้
4. **Authentication → URL Configuration** ตั้ง **Site URL** เป็น URL ของ GitHub Pages (ขั้นที่ 9)

### 6. ตั้งค่า Storage
migration สร้าง bucket `progress-photos` แบบ **private** ให้แล้ว พร้อม policy ให้เข้าถึงได้เฉพาะโฟลเดอร์ `<user_id>/` ของตัวเอง
ตรวจที่ **Storage** ว่ามี bucket นี้และไม่ได้ติ๊ก Public (ใช้ใน Phase 2)

### 7. ตั้งค่า .env

```powershell
Copy-Item .env.example .env
notepad .env
```

ใส่ค่า:

```
VITE_SUPABASE_URL=https://<Reference ID>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

### 8. รันบนเครื่อง

```powershell
npm run dev
```

เปิด http://localhost:5173 → ล็อกอิน → หน้า Onboarding ให้ตรวจ/แก้ข้อมูลแล้วกด **เริ่มใช้งาน**

เปิดจากมือถือในวง Wi-Fi เดียวกัน: `npm run dev -- --host` แล้วเข้า `http://<IP เครื่อง>:5173`

### 9. Deploy ขึ้น GitHub Pages
1. สร้าง repo ใหม่ที่ GitHub (เช่น `workout-log`) — แนะนำตั้งเป็น **Private** ก็ได้ถ้าใช้ GitHub Pro ไม่งั้นต้อง Public
   (ข้อมูลอยู่ใน Supabase ไม่ได้อยู่ใน repo)
2. push โค้ด:
   ```powershell
   git add .
   git commit -m "Workout Log phase 1"
   git remote add origin https://github.com/<user>/workout-log.git
   git push -u origin main
   ```
3. ที่ repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**
4. ตั้ง secrets (ขั้นที่ 10) แล้วไปที่แท็บ **Actions → Deploy to GitHub Pages → Run workflow**
5. เว็บจะอยู่ที่ `https://<user>.github.io/workout-log/`

workflow จะ build ใหม่อัตโนมัติทุกครั้งที่ push ขึ้น `main` (ตั้ง base path จากชื่อ repo ให้เอง และใช้ HashRouter จึง refresh หน้าไหนก็ได้)

### 10. ตั้ง GitHub Actions secrets
repo → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |

anon key ถูกฝังในเว็บอยู่แล้วโดยธรรมชาติ ความปลอดภัยมาจาก RLS (แต่ละแถวเข้าถึงได้เฉพาะ `user_id` ของตัวเอง)

### 11. กันโปรเจกต์ Supabase ฟรีถูกพัก
workflow `Keep Supabase awake` (`.github/workflows/keepalive.yml`) จะ query ฐานข้อมูลทุก 3 วันอัตโนมัติ ใช้ secrets ชุดเดียวกัน
ทดสอบได้ที่ **Actions → Keep Supabase awake → Run workflow**

### 12. การแจ้งเตือน (Edge Function + pg_cron)
ระบบ: `pg_cron` เรียก Edge Function `notify` ทุก 15 นาที → ส่งตามเวลาที่ตั้งในแอป (เพิ่มเติม → การแจ้งเตือน)
- เช้า: ชั่งน้ำหนัก + แผนวันนี้ · ค่ำ: ยังไม่บันทึกอาหาร/ออกกำลังกาย/น้ำหนัก (ถ้าครบแล้วไม่ส่ง) · วันจันทร์เช้า: สรุปรายสัปดาห์

**ตั้งค่าครั้งแรก** (ทำให้แล้วสำหรับโปรเจกต์นี้ ยกเว้นข้อ 3):
1. Secrets ของ function:
   ```powershell
   npx supabase secrets set NOTIFY_SECRET=<สุ่มยาวๆ> VAPID_PUBLIC_KEY=<...> VAPID_PRIVATE_KEY=<...> VAPID_SUBJECT=https://<user>.github.io/workout-log/ APP_URL=https://<user>.github.io/workout-log/
   npm run functions:deploy
   ```
   (สร้าง VAPID ด้วย `npx web-push generate-vapid-keys` แล้วใส่ public key ใน `src/lib/push.ts`)
2. รัน `supabase/setup_cron.sql` ใน SQL Editor (แทน `<NOTIFY_SECRET>` และ `<PROJECT_REF>` ก่อน)
3. **อีเมล:** สมัคร https://resend.com (ฟรี 3,000 ฉบับ/เดือน) ด้วย**อีเมลเดียวกับที่ล็อกอินแอป** → API Keys → Create →
   ```powershell
   npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx
   ```
   ผู้ส่งเริ่มต้นคือ `onboarding@resend.dev` ซึ่งส่งได้เฉพาะอีเมลเจ้าของบัญชี Resend (พอสำหรับใช้คนเดียว)
4. ในแอป: เพิ่มเติม → การแจ้งเตือน → เปิดอีเมล/Web Push → กด "ทดสอบเช้า"

**Web Push:** Android/คอมเปิดได้เลย · iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน (iOS 16.4+) แล้วเปิดจากไอคอนบนหน้าจอโฮม

### 12.1 สำรองข้อมูลอัตโนมัติ
workflow `Weekly backup` export JSON ทุกวันจันทร์ 03:00 เก็บเป็น artifact 90 วัน (ไม่ commit ลง repo)
ต้องเพิ่ม GitHub secret `SUPABASE_SERVICE_ROLE_KEY` = Supabase → Project Settings → API Keys → **Secret key** (หรือ legacy `service_role`)
— key นี้ใช้ใน GitHub Actions เท่านั้น ห้ามใส่ในโค้ดหน้าเว็บ · ดาวน์โหลดได้ที่ Actions → Weekly backup → Artifacts
กู้คืน: เพิ่มเติม → Export / Import → เลือกไฟล์ JSON (ตรวจข้อมูลซ้ำก่อนนำเข้า)

### 13. ติดตั้งเป็นแอปบนมือถือ (PWA)
**iPhone (Safari เท่านั้น):** เปิดเว็บ → ปุ่ม **แชร์** (สี่เหลี่ยมมีลูกศรขึ้น) → **เพิ่มไปยังหน้าจอโฮม** → เพิ่ม
**Android (Chrome):** เปิดเว็บ → เมนู ⋮ → **ติดตั้งแอป** / **เพิ่มลงในหน้าจอหลัก**
**คอมพิวเตอร์ (Chrome/Edge):** กดไอคอนติดตั้งที่แถบที่อยู่

---

## ทดสอบ

```powershell
npm test          # unit test: pace, 1RM, % เป้าหมาย, regression, TDEE, day_no แผนวิ่ง, timer, กฎสรุปรายสัปดาห์, streak
npm run db:check  # รัน migration + seed บน PGlite (Postgres ใน WASM) แล้วทดสอบ RLS, bootstrap_user, today_plan
npm run typecheck
npm run build
```

### อัปเดตฐานข้อมูลเมื่อมี migration ใหม่

```powershell
npx supabase db push
```

migration `20261001000001_phase2.sql` จะเพิ่มโปรแกรม "นายแบบ 1-3" ให้ผู้ใช้เดิมอัตโนมัติ (ผู้ใช้ใหม่ได้ตอนล็อกอินครั้งแรก)

### ทดสอบด้วยมือ (Phase 1)
1. **ล็อกอินครั้งแรก** → เห็นหน้า Onboarding ค่าตั้งต้นครบ (178.6 ซม., MaxHR 186, เป้า 76 กก., ตาราง จ/พ/ศ เวท, อ/พฤ/ส วิ่ง, อา พัก) → กดเริ่มใช้งาน
2. **หน้าวันนี้** → วันจันทร์/พุธ/ศุกร์ควรเป็น "วันเวท · โปรแกรม A/B", อังคาร/พฤหัส/เสาร์เป็นวิ่ง พร้อม segment และ HR เป็น bpm
3. **น้ำหนักตัว** → กด +/− แล้วบันทึก → กดซ้ำจะเป็น "แก้ไข" (ทับค่าเดิม วันละ 1 ค่า)
4. **บันทึกเวท** → Rehab แสดงก่อนท่าหลัก, ติ๊ก ✓ เซ็ต → rest timer นับถอยหลัง มีเสียง/สั่นเมื่อครบ, ปิดแอปกลางคันแล้วเปิดใหม่ → draft ยังอยู่,
   ช่องเจ็บศอกซ้าย > 3 มีคำเตือน, บันทึกแล้วเปิดใหม่ → เห็น "ครั้งก่อน dd/mm: …" และโปรแกรมเปลี่ยนเป็น B
5. **จัดการโปรแกรม** → สร้าง/คัดลอก A เป็น C, ลาก ⠿ เรียงท่า, แตะท่าเพื่อแก้เป้า, ตั้ง rotation และตารางสัปดาห์
6. **แผนวิ่ง** → เลือก 21KM Begin → เริ่มแผน → ปฏิทิน 6 ช่อง/แถว สีตามประเภท วันที่ต้องตรวจสอบมีขอบเหลือง → หน้าวันนี้เปลี่ยนเป็น Day 1
7. **บันทึกวิ่ง** → กรอก 5 กม. / 30:00 → pace 6:00 ทันที, กรอก HR → แสดง %MaxHR เทียบช่วงแผน, บันทึกครั้งที่ 2 → เทียบ pace กับครั้งก่อน
8. **Interval timer** → เลือก Interval → เริ่ม → เสียง 3-2-1 และสั่นตอนเปลี่ยนช่วง
9. **ข้าม/เลื่อนแผน** → กด "เลื่อนแผน 1 วัน" → พรุ่งนี้จะเป็น Day เดิม, ในปฏิทินแผนวันที่ขยับ
10. **ออฟไลน์** → DevTools → Network → Offline (หรือเปิดโหมดเครื่องบิน) → บันทึกน้ำหนัก/วิ่ง → มุมขวาบนขึ้น "รอส่ง N รายการ" → กลับมาออนไลน์ ส่งอัตโนมัติ

### ทดสอบด้วยมือ (Phase 2)
1. **ภาพรวม** (หน้าแรก) → การ์ดเป้าหมายทุกอันพร้อม progress bar, สถานะ ✅/⚠️/🎯, วันที่เหลือ, คาดการณ์วันถึงเป้า (ต้องมีน้ำหนัก ≥ 4 วันในช่วง ≥ 7 วัน)
2. **ความสม่ำเสมอ** → สัปดาห์นี้/เดือนนี้ เวท/วิ่ง x/y (%), Streak, heatmap 12 สัปดาห์ (แตะช่องเพื่อดูรายละเอียด)
3. **พัฒนาการ** → สลับ "4 สัปดาห์ก่อน / วันเริ่มโปรแกรม / ครั้งแรก" ลูกศรเขียว = ไปในทิศที่ดี
4. **สรุปรายสัปดาห์** → กด "สัปดาห์นี้" เพื่อดูระหว่างสัปดาห์ · วันจันทร์ถัดไปจะสร้างสรุปของสัปดาห์ที่แล้วให้อัตโนมัติ และเก็บไว้ดูย้อนหลัง
5. **PR** → บันทึกเวทท่าเดิมให้หนักขึ้น → ขึ้นใน "PR ล่าสุด"; Achievements แสดงความคืบหน้า
6. **วันนี้** → Check-in (นอน/พลังงาน/ความล้า/RHR/ก้าว) และสรุปสัปดาห์แบบย่อ
7. **ร่างกาย** (เพิ่มเติม → ร่างกาย) → บันทึก InBody, อัปโหลดรูป 3 มุม (ย่อก่อนอัปโหลด), เทียบรูปก่อน-หลัง, บันทึกอาการเจ็บทุกจุด
8. **เป้าหมาย** → เพิ่ม/แก้/ปิด · เมื่อถึงเป้าจะมีแอนิเมชันฉลองและถามว่าจะตั้งเป้าถัดไปหรือไม่
9. **ความก้าวหน้า** → กราฟน้ำหนัก (รายวัน + เฉลี่ย 7 วัน + เส้นเป้า + อัตราต่อสัปดาห์), เวทรายท่า, pace, ระยะ/สัปดาห์, body comp, อาการเจ็บ, PR 5K/10K/21K · ทุกกราฟกด "ตาราง" ได้
10. **ประวัติ** → กรองตามประเภท, แตะเพื่อแก้ (เวทแก้รายเซ็ตได้), ลบแล้วกด "เลิกทำ" ภายใน 5 วินาที
11. **โปรแกรมนายแบบ** → หน้าเวท เลือก "นายแบบ 1/2/3" → ท่าคู่ขึ้น "↔ Superset" ท่าแรกของคู่ไม่มีเวลาพัก ท่าที่สองพัก 60 วิ เป้า 4 × 15-20
    (ถ้าจะใช้แทน A/B ให้ไปที่ "จัดการโปรแกรม → Rotation")

### ทดสอบด้วยมือ (Phase 3)
1. **อาหาร** (แท็บล่าง 🍽) → เป้าของวันเปลี่ยนตามประเภทวัน (เวท/วิ่งเบา/วิ่งหนัก/พัก) โปรตีนคงที่ 160 g
2. **เพิ่มอาหาร 3 แตะ** → "+ เพิ่มอาหาร" → แตะ "อกไก่ต้ม" (อยู่ในรายการโปรด) → "เพิ่ม" · ปรับจำนวนเสิร์ฟทีละ 0.5 ได้ · ค้นหา "กะเพรา" หรือ "chicken"
3. **เหมือนเมื่อวาน** (คัดลอกมื้อเดียวกันจากเมื่อวาน), **⋯ → บันทึกเป็น template** แล้วใช้ "📋 Template", **⚡ Quick add** (kcal + โปรตีน)
4. **สแกนบาร์โค้ด** → 📷 → สแกนสินค้า → ถ้าเจอใน Open Food Facts จะเติมค่าให้ → บันทึกลงคลัง → เพิ่ม (ต้องออนไลน์; iPhone ใช้ ZXing)
5. **สูตรอาหาร** → สร้างจากวัตถุดิบดิบ เช่น อกไก่ดิบ 1000 g + ข้าวกล้องดิบ 500 g แบ่ง 5 เสิร์ฟ → เลือกได้ในหน้าเพิ่มอาหาร
6. **แนะนำ** → ถ้าโปรตีนยังขาด ≥ 10 g จะเสนอเช่น "อกไก่ต้ม 150 g หรือ Whey 1 scoop + ไข่ต้ม 3 ฟอง"
7. **Adaptive TDEE** → ต้องบันทึกอาหาร ≥ 10 จาก 14 วัน + น้ำหนัก ไม่งั้นขึ้น "ข้อมูลไม่พอ" · สัปดาห์ใหม่จะเสนอปรับ kcal (ต้องกด "ยืนยันปรับ" เท่านั้น)
8. **น้ำ** +250/+500 และ **อาหารเสริม** ติ๊กรายวัน (มีบนหน้าวันนี้ด้วย)
9. รายการอาหารที่ค่าอาจคลาดเคลื่อนมาก: `supabase/FOODS_REVIEW.md`

### ทดสอบด้วยมือ (Phase 4)
1. **รองเท้า** (เพิ่มเติม → 👟 รองเท้า หรือลิงก์ใต้ช่องรองเท้าในหน้าวิ่ง) → เพิ่มรองเท้า ตั้งระยะเดิม 650 กม. → บันทึกวิ่งด้วยรองเท้านั้น → ขึ้นเตือน "ใกล้ถึงระยะเปลี่ยน"
2. **สภาพอากาศ** → เปิดหน้าบันทึกวิ่ง อุณหภูมิ/ความชื้นเติมเองจาก Open-Meteo (📍 = ใช้ตำแหน่งปัจจุบัน, ↻ = ดึงใหม่) แก้เองได้
3. **Import** → "📂 Import ไฟล์" เลือก .gpx/.fit/.tcx จาก Garmin/Strava/Coros → เติมระยะ เวลา HR และแสดง splits รายกม. → บันทึก · import ไฟล์เดิมซ้ำจะเตือน
4. **Deload** → หน้าเวท กด "เริ่ม" ที่แถบ deload → น้ำหนักเหลือ 60% และ 2 เซ็ตถึงวันอาทิตย์นี้ (session บันทึกเป็น deload)
5. **Warm-up** → จัดการโปรแกรม → 🔥 Warm-up routine แก้รายการ → หน้าวันนี้แสดงตามนั้น
6. **หุบ/กางท่า** → หน้าเวทเปิดเฉพาะท่าแรก ติ๊กครบทุกเซ็ตแล้วหุบเองและเปิดท่าถัดไป (superset กางคู่กัน)
7. **แจ้งเตือนในแอป** → หน้าวันนี้มีการ์ด 🔔 เมื่อเข้ากฎข้อ 6 (เช่น เจ็บ ≥ 4 ติดกัน 3 ครั้ง, วิ่งเพิ่มเกิน 10%)
8. **อีเมล/Push** → เพิ่มเติม → การแจ้งเตือน → เปิด → "ทดสอบเช้า/ค่ำ/สรุป"
9. **Export/Import** → เพิ่มเติม → 💾 → JSON / CSV (zip เปิดใน Excel) → Import ไฟล์ JSON เดิม → ทุกแถวขึ้นว่า "ซ้ำ (ข้าม)"

---

## คำสั่งอื่นๆ

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run plans:build` | สร้าง `seed_run_plans.json` ใหม่จาก `scripts/build-run-plans.mjs` |
| `npm run seed:build` | สร้าง `seed.sql` ใหม่จาก JSON |
| `npm run gen:types` | generate types จากฐานข้อมูลจริง (หลัง `supabase link`) ลง `src/types/supabase.ts` |
| `node scripts/gen-icons.mjs` | สร้างไอคอน PWA ใหม่ |

## เพิ่มตาราง/แก้ schema
สร้างไฟล์ใหม่ใน `supabase/migrations/` (ชื่อขึ้นต้นด้วยวันเวลา เช่น `20261001000001_add_xxx.sql`) **ห้ามแก้ migration เดิม**
แล้ว `npx supabase db push` และ `npm run db:check`

## ข้อจำกัดความรับผิดชอบ
ตัวเลขโภชนาการ แคลอรี่ และคำแนะนำทั้งหมดในแอปเป็นค่าประมาณ ไม่ใช่คำแนะนำทางการแพทย์
แผนวิ่งอ้างอิงตาราง FASTBULL RUN — ใช้ส่วนตัว
