# Workout Log

เว็บแอป (PWA) บันทึกการออกกำลังกาย แผนวิ่ง โภชนาการ และพัฒนาการของร่างกาย สำหรับผู้ใช้คนเดียว

- React + Vite + TypeScript + Tailwind, TanStack Query, React Hook Form + Zod
- Supabase (PostgreSQL + Auth + Storage) แพ็กเกจฟรี — ใช้แค่ anon key + Row Level Security
- Deploy บน GitHub Pages ผ่าน GitHub Actions, ติดตั้งลงหน้าจอหลักได้ (PWA) และบันทึกแบบออฟไลน์ได้

> **สถานะ:**
> - Phase 1 ✅ วันนี้, น้ำหนักตัว, บันทึกเวท, จัดการโปรแกรม, บันทึกวิ่ง, แผนวิ่ง, interval timer, offline queue
> - Phase 2 ✅ Dashboard, เป้าหมาย, กราฟความก้าวหน้า, ประวัติ (แก้/ลบ/Undo), Check-in, อาการเจ็บ, Body comp, รูปความก้าวหน้า,
>   สรุปรายสัปดาห์ตามกฎข้อ 6, PR/Achievements, โปรแกรม "กระชับกล้ามเนื้อ (นายแบบ)" 3 วันจากหนังสือ
> - Phase 3-4 (โภชนาการ, อีเมล, Web Push ฯลฯ) — ยังไม่ได้ทำ

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

### 12. อีเมลแจ้งเตือน (Edge Function)
จะทำใน Phase 4 (Supabase Edge Function + pg_cron)

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
